"""通过 GitHub API 将 AI 修复代码提交到 PR 分支"""
import logging

logger = logging.getLogger(__name__)


async def apply_fixes_to_pr(
    owner: str,
    repo: str,
    pull_number: int,
    rewritten_files: list[dict],
    token: str,
) -> dict:
    """获取 PR 的 head branch，将修复后的文件提交到分支"""
    import httpx

    if not rewritten_files:
        return {"ok": False, "error": "没有可提交的修复文件"}

    timeout = httpx.Timeout(30.0)
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async with httpx.AsyncClient(timeout=timeout, headers=headers, verify=False) as client:
        # 1. 获取 PR 详情
        pr_url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}"
        pr_resp = await client.get(pr_url)
        if pr_resp.status_code != 200:
            logger.error(f"获取 PR 失败: {pr_resp.status_code}")
            return {"ok": False, "error": f"获取 PR 信息失败 (HTTP {pr_resp.status_code})"}
        pr_data = pr_resp.json()
        head_repo = pr_data["head"]["repo"]
        head_owner = head_repo["owner"]["login"]
        head_repo_name = head_repo["name"]
        head_ref = pr_data["head"]["ref"]
        logger.info(f"PR head: {head_owner}/{head_repo_name} branch={head_ref}")

        # 2. 获取 head branch 最新 commit SHA
        branch_url = f"https://api.github.com/repos/{head_owner}/{head_repo_name}/git/ref/heads/{head_ref}"
        branch_resp = await client.get(branch_url)
        if branch_resp.status_code != 200:
            return {"ok": False, "error": f"获取分支信息失败 (HTTP {branch_resp.status_code})"}
        branch_data = branch_resp.json()
        latest_sha = branch_data["object"]["sha"]

        # 3. 逐个更新文件
        updated_files = []
        errors = []
        for rf in rewritten_files:
            filename = rf["filename"]
            content = rf["content"]
            try:
                # 获取当前文件 SHA（如果文件存在）
                file_url = f"https://api.github.com/repos/{head_owner}/{head_repo_name}/contents/{filename}"
                file_resp = await client.get(file_url, params={"ref": head_ref})

                put_body = {
                    "message": f"🤖 AI 代码审查自动修复: {filename}",
                    "content": _encode_content(content),
                    "branch": head_ref,
                }

                if file_resp.status_code == 200:
                    file_data = file_resp.json()
                    put_body["sha"] = file_data["sha"]

                put_resp = await client.put(file_url, json=put_body)
                if put_resp.status_code in (200, 201):
                    updated_files.append(filename)
                    logger.info(f"已更新文件: {filename}")
                else:
                    err = put_resp.json()
                    errors.append(f"{filename}: {err.get('message', 'HTTP ' + str(put_resp.status_code))}")
                    logger.warning(f"更新文件失败 {filename}: {put_resp.status_code}")
            except Exception as e:
                errors.append(f"{filename}: {e}")
                logger.error(f"更新文件异常 {filename}: {e}")

        if not updated_files:
            return {"ok": False, "error": f"所有文件更新失败: {'; '.join(errors)}"}

        commit_url = f"https://github.com/{head_owner}/{head_repo_name}/commits/{head_ref}"
        result = {
            "ok": True,
            "message": f"已提交 {len(updated_files)} 个文件的修复到 {head_ref}",
            "updated_files": updated_files,
            "commit_url": commit_url,
        }
        if errors:
            result["warnings"] = errors
        return result


def _encode_content(text: str) -> str:
    import base64
    return base64.b64encode(text.encode("utf-8")).decode("ascii")
