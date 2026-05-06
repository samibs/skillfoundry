# Blue Team & Detection Reference

Use this when the user is on the defending side of an active or suspected incident — log review, IOC analysis, "is this a real attack," detection engineering, or post-exploitation hunt. The mental model: defenders work in evidence, not certainty. Your job is to help them see what's actually there, distinguish signal from noise, and act proportionally.

## The first questions on any suspected incident

1. **What's the trigger?** Alert, user report, anomaly someone noticed, audit finding, third-party notification (e.g., LE, partner, threat intel feed). The trigger source affects credibility and urgency.
2. **What's the timeline?** When was the earliest evidence, when was it noticed, what's the gap. Long detection lag means more potential dwell time.
3. **What's in scope?** What systems, what user accounts, what data. Don't expand investigation scope reflexively — but don't artificially narrow it either if evidence suggests broader compromise.
4. **What's the business context?** Is the affected system in scope for compliance? Are there legal hold considerations? Is this a customer-impacting incident? These shape disclosure decisions.

## Triage — is this a real incident?

Most alerts aren't incidents. The triage question is: does the evidence rule out benign explanations? A useful sequence:

**Step 1 — Reproduce the trigger.** Pull the actual log entry / detection that fired. Read it. Often the alert summary in the SIEM strips information that's relevant.

**Step 2 — Establish baseline.** Has this user / host / service done this before? Authenticated logins from a new country might be malicious or might be the user on vacation. Powershell with encoded commands might be malicious or might be a known scheduled task. Check history.

**Step 3 — Correlate.** Are there adjacent events? An auth from a new IP is one signal; an auth from a new IP followed by access to an unusual resource by that account is a much stronger signal.

**Step 4 — Pivot to the host/identity.** Pull all activity from the suspect entity in the relevant time window. Look for the things that should be there (does this look like normal use of the account?) and the things that shouldn't (data access patterns that don't match the role, command execution on a host that normally only runs the application binary).

**Step 5 — Decide.** Real incident → escalate per the IR plan. Benign → close with a note (and consider whether the detection should be tuned). Inconclusive → expand the time window and broaden the pivot, but don't sit on it.

## Indicators — what to actually pay attention to

### On endpoints

**Process lineage.** A web server spawning `cmd.exe`, `bash`, `powershell.exe`, or `wscript.exe` is almost always an incident in modern environments. A `winword.exe` spawning powershell is malicious. Office processes spawning shells were the canonical macro-malware signature for years and remain one of the highest-signal detections.

**Persistence indicators.** New scheduled tasks (especially in non-standard paths). New services. New registry run keys. New WMI subscriptions. New cron jobs in `/etc/cron.d/`, `/var/spool/cron/`. New systemd timers. New SSH keys in `~/.ssh/authorized_keys`. Modifications to login scripts (`.bashrc`, `.zshrc`, `/etc/profile.d/`).

**Credential access.** Reads of `lsass.exe` memory (Mimikatz family — but legitimate AV/EDR also touches this). Reads of `/etc/shadow` by non-root processes. SAM/SECURITY hive access. Reads of browser-saved-password databases by non-browser processes. Cloud SDK credential file access by unexpected processes.

**Lateral movement.** SMB / WMI / WinRM / RDP between hosts that don't normally talk. Service creation on remote hosts. Pass-the-hash and pass-the-ticket primitives (logon types 3 and 9, NTLM hash reuse patterns, Kerberos TGT manipulation).

**Defense evasion.** Disabled AV. Cleared event logs. Disabled audit policies. Tampered EDR. PowerShell with `-EncodedCommand`, `IEX`, or `DownloadString`. Living-off-the-land binaries used outside their normal context (`certutil` downloading files, `mshta` executing remote content, `regsvr32` with HTTP URLs, `bitsadmin` transferring binaries).

### In network telemetry

**Beaconing patterns.** Periodic outbound connections to the same destination — especially if jittered to look slightly random but with a clear central tendency. C2 channels often look like this.

**DNS abuse.** Unusually long DNS queries (data exfil via DNS), high-entropy subdomains (DGA), queries to known-bad TLDs or suspicious infrastructure, DNS over HTTPS to unexpected resolvers.

**TLS fingerprints.** JA3/JA4 hashes on outbound TLS that don't match known software in the environment. Self-signed certs on outbound connections. Unusual SNI.

**Geographic anomalies.** Outbound connections to countries the org doesn't do business with. Inbound logins from countries where the user isn't.

**Volume anomalies.** Sudden large outbound transfers, especially from systems that normally don't transfer much. Sudden spikes in DNS query volume from a single host.

### In identity / SaaS / cloud

**Authentication anomalies.**
- Successful auths after a high volume of failures (brute force success)
- Successful auths from new countries / impossible travel patterns
- Successful auths bypassing MFA via a fallback flow
- Token reuse from new IPs / user agents (token theft)
- OAuth consent grants to suspicious apps
- Service principal logins outside expected hours / from unexpected locations
- Federation trust modifications

**Privilege grant changes.** New admin role assignments. New role bindings in K8s. New IAM policy attachments in cloud. Changes to who can read sensitive resources.

**Access pattern changes.** A user account suddenly accessing resources outside their normal scope. Bulk reads from a data store. Enumeration patterns in API logs (sequential access to many records).

**Configuration changes during incidents.** Logging disabled. Audit retention shortened. Security group rules opened. KMS key policies modified. These are post-exploitation indicators — the attacker covering tracks or expanding access.

## MITRE ATT&CK as a framework

ATT&CK is a vocabulary, not a magic wand. Use it for:

1. **Mapping detections to tactics.** What's our coverage across Initial Access → Execution → Persistence → Privilege Escalation → Defense Evasion → Credential Access → Discovery → Lateral Movement → Collection → C2 → Exfiltration → Impact? Gaps are work to do.
2. **Communicating findings.** "T1078.004 Valid Accounts: Cloud Accounts" is a precise reference an experienced reader recognizes immediately.
3. **Threat-informed defense.** Pick adversary groups that target your sector and audit your detection coverage against their known techniques.

What ATT&CK is *not* good for: a checklist of "detections to deploy." Many techniques have no clean detection signature; some are detectable only in combination. Don't conflate "we have an alert for every technique" with "we'd actually catch this."

## Detection engineering

Good detections are:

**Specific.** They fire on the actual malicious behavior, not a category that includes legitimate activity. "PowerShell executed" is not a detection. "PowerShell with `-EncodedCommand` containing base64-decoded `IEX` or `DownloadString` from a non-IT user account" is.

**Tunable.** When they generate false positives, you can refine the logic without rewriting it. Detections that allow per-host / per-user / per-context exceptions are sustainable.

**Tested.** You ran the technique in a lab and confirmed your detection caught it. "It would catch it in theory" is not testing.

**Owned.** Someone is responsible for it. When it fires and it's noisy, someone fixes it. When it stops firing, someone notices.

**Documented.** What does it detect, what's the response playbook, what are the known FPs. A SIEM with 5,000 detections nobody can explain is a liability, not an asset.

The detection engineering loop:

1. Threat model the environment — what techniques are most relevant
2. For each technique, determine if it's detectable with current telemetry
3. If yes, write the detection. If no, fix the telemetry first
4. Test by running the technique
5. Tune based on FPs in production
6. Periodically re-test (atomic red team is an industry standard tool here)

## Incident response — the broad shape

Without going full IR-handbook, the standard NIST-derived phases are:

**Preparation** — playbooks, IR retainers, tooling, tabletops. Done before the incident.

**Identification** — confirming an incident is real, scoping what's affected, classifying severity.

**Containment** — short-term (isolate affected hosts, disable compromised accounts) and long-term (rebuild, patch, lock down attack vector). Containment decisions trade off evidence preservation vs. limiting damage. For a contained, low-impact incident, take time to gather evidence; for an active spreading incident, contain first.

**Eradication** — remove the threat actor's persistence, rotate compromised credentials and keys, rebuild compromised systems. The hard question: when can you be sure they're out? Conservative answer is rebuild from known-good, rotate everything, and reset trust relationships.

**Recovery** — restore services, monitor for re-entry, communicate as appropriate (customers, regulators, partners). Post-recovery monitoring is critical — adversaries who get evicted often try to come back through a different door.

**Lessons learned** — what controls failed, what would have caught this earlier, what's the action list. Without this phase, the same incident happens again.

## Forensic triage on a suspected host

If you're handed a host and asked "is it compromised":

**On Linux:**
- Process tree, looking for unexpected parents/children: `ps auxf`, `pstree`
- Network connections: `ss -tnp`, `lsof -i`
- Persistence locations: `/etc/cron.*`, `/var/spool/cron/`, `/etc/systemd/system/`, `~/.bashrc`, `~/.profile`, `/etc/profile.d/`, `~/.ssh/authorized_keys`
- Recent file modifications: `find / -mtime -7 -type f 2>/dev/null` (filter by suspect time window)
- Unusual SUID binaries: `find / -perm -4000 -type f 2>/dev/null`
- Login records: `last`, `lastb`, `who`, `/var/log/auth.log`, `/var/log/secure`
- Bash history of relevant accounts
- Loaded kernel modules: `lsmod` (compare to known good)

**On Windows:**
- Sysinternals' Autoruns covers most persistence locations in one pass
- `Get-Process | Where-Object {$_.Path -like "*Temp*" -or $_.Path -like "*ProgramData*"}` for processes from suspicious paths
- Event logs: 4624 (logon), 4688 (process creation, if enabled), 4697 (service installation), 7045 (service installation, system log)
- Scheduled tasks: `schtasks /query /fo CSV /v` or `Get-ScheduledTask`
- WMI persistence: `Get-WmiObject -Namespace root\subscription -Class __EventFilter` (and `__EventConsumer`, `__FilterToConsumerBinding`)
- Recent files: `Get-ChildItem C:\ -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {$_.LastWriteTime -gt (Get-Date).AddDays(-7)}`

For deep forensic work, image the host and analyze offline — running tools on a live compromised system is unreliable (rootkits, anti-forensics) and risks tipping off the adversary.

## What good blue team output looks like

When responding to a "is this an incident" question:

- State your conclusion clearly: real / not real / inconclusive
- Show the evidence: the actual log entries, not summaries
- Walk through what each piece of evidence means and what it rules out
- Recommend the next concrete step — pivot to host X, query Y, isolate Z
- Don't speculate beyond evidence. "The login from Russia is unusual but consistent with the user being on vacation; before declaring an incident, contact the user to confirm" is more useful than "this is definitely APT-XX."

When designing a detection:

- State the technique it detects (ATT&CK reference if applicable)
- Show the actual logic (the SIEM query, the EDR rule, the YARA signature)
- Note expected FP sources and tuning levers
- Define the response: when this fires, who does what

When writing an IR retrospective:

- Timeline of events: detection, decision points, actions, recovery
- What worked: controls that fired, decisions that were good
- What didn't: detection gaps, slow decisions, missing playbooks
- Action items: owned, dated, prioritized

## What bad blue team output looks like

- "It might be malicious" without saying what would resolve the ambiguity
- Speculation about specific threat actors with no evidence
- Recommending wholesale rebuilds without evidence the host is actually compromised
- Recommending no action when there's clear evidence of compromise
- Pasting tool output as conclusion without interpretation
