# Security Audit Prompt

Run a security audit of this server and report findings. Check:

1. **Open ports** — `ss -tlnp` — anything unexpected listening externally?
2. **SSH config** — Is root login restricted? Password auth disabled?
3. **Running services** — Anything unnecessary running?
4. **Disk usage** — Any partition above 80%?
5. **Failed login attempts** — Check `journalctl -u sshd` for recent failures
6. **Unattended upgrades** — Still enabled and working?
7. **Pending security updates** — Any available?

Format as a concise report with letter grades (A-F) per category.
End with a one-line overall assessment.
If anything is grade C or below, flag it clearly with ⚠️.
