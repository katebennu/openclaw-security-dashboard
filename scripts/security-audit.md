# Security Audit Prompt

You are running as the `scanner` user with LIMITED privileges. You can READ system state but CANNOT modify anything. All commands run as `scanner` automatically.

Run a security audit of this server. Check:

1. **Open ports** — `sudo ss -tlnp` — anything unexpected listening externally? (sudo allowed for this command only)
2. **SSH config** — `cat /etc/ssh/sshd_config` — Is root login restricted? Password auth disabled?
3. **Running services** — `systemctl list-units --type=service --state=running` — Anything unnecessary?
4. **Disk usage** — `df -h` — Any partition above 80%?
5. **Failed login attempts** — `journalctl -u ssh --since '5 minutes ago' --no-pager` — Recent failures?
6. **Unattended upgrades** — `cat /etc/apt/apt.conf.d/20auto-upgrades` — Still enabled?
7. **Pending security updates** — `apt list --upgradable 2>/dev/null` — Any available?

IMPORTANT: Do NOT attempt to fix, modify, or remediate any issues. Report only.

Format as a concise report with letter grades (A-F) per category.
End with a one-line overall assessment.
If anything is grade C or below, flag it clearly with ⚠️.
