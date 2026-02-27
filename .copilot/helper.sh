#!/bin/bash

# Copilot Agent Helper
# Quick reference for using agents in GitHub Copilot CLI

cat << 'EOF'
╔═══════════════════════════════════════════════════════════╗
║        GitHub Copilot CLI - Agent Quick Reference         ║
╚═══════════════════════════════════════════════════════════╝

USAGE PATTERN:
--------------
Agents are invoked via the task() tool in GitHub Copilot CLI.

SYNTAX:
-------
task(
  agent_type="task",           # or "explore" for exploration
  description="Brief summary",  # 3-5 words
  prompt="Detailed instructions with context"
)

AVAILABLE AGENTS:
-----------------
├── coder.md           - Ruthless implementation with TDD
├── tester.md          - Brutal testing and edge cases  
├── architect.md       - Architecture review and design
├── evaluator.md       - BPSBS compliance checking
├── debugger.md        - Systematic root-cause debugging
├── docs.md            - Documentation generation
├── gate-keeper.md     - Capability verification
├── prd.md             - PRD creation and validation
├── standards.md       - Code standards enforcement
├── memory.md          - Context preservation
└── + 12 more...

EXAMPLES:
---------

1. IMPLEMENT WITH CODER AGENT:
   
   task(
     agent_type="task",
     description="Implement auth service",
     prompt="""
     Read the following files:
     - .copilot/custom-agents/coder.md (agent instructions)
     - genesis/user-authentication.md (PRD)
     - agents/_tdd-protocol.md (TDD standards)
     
     Implement the user authentication service following coder.md standards:
     - Validate PRD is complete
     - Write failing tests first (RED phase)
     - Implement minimal code to pass (GREEN phase)
     - Refactor for quality
     - Add comprehensive error handling and logging
     """
   )

2. BRUTAL TESTING WITH TESTER AGENT:

   task(
     agent_type="task",
     description="Test auth service",
     prompt="""
     Read .copilot/custom-agents/tester.md and src/auth/service.py
     
     Apply ruthless testing standards:
     - Positive, negative, and edge cases
     - Security probes (injection, escalation)
     - Performance stress tests
     - Integration failure scenarios
     
     Create comprehensive test suite.
     """
   )

3. ARCHITECTURE REVIEW:

   task(
     agent_type="task",
     description="Review architecture",
     prompt="""
     Read .copilot/custom-agents/architect.md and all files in src/
     
     Perform cold-blooded architecture review:
     - Challenge all assumptions
     - Validate scalability and security
     - Demand RACI matrix
     - Create system diagram
     """
   )

4. EXPLORE CODEBASE:

   task(
     agent_type="explore",
     description="Find auth logic",
     prompt="Locate all authentication and authorization code. Explain the flow."
   )

SHARED MODULES:
---------------
All agents reference shared protocols in agents/ directory:

├── _tdd-protocol.md             - Test-driven development
├── _context-discipline.md       - Token management
├── _agent-protocol.md           - Inter-agent communication
├── _systematic-debugging.md     - Four-phase debugging
├── _parallel-dispatch.md        - Parallel execution
└── + more...

Include relevant shared modules in your prompts when needed.

PRD-DRIVEN WORKFLOW:
--------------------
1. Create PRDs in genesis/ folder (use TEMPLATE.md)
2. Invoke agents with PRD context
3. Agents validate, implement, test
4. Production-ready code

TIPS:
-----
• Always reference the specific agent .md file in your prompt
• Include relevant PRDs from genesis/
• Reference shared modules from agents/ as needed
• Chain agents: coder → tester → evaluator
• Use "explore" agent type for questions, "task" for work

For full details, see: .copilot/custom-agents/README.md
EOF
