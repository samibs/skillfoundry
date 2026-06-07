# PRD: Tag normalization docs for SkillFoundry

## Problem
The tag-handling utilities need a documented, certified normalization helper.

<!-- factory:skills
- Convert a list of plain text tags into a normalized lowercase slug array, trimming whitespace
-->

## Scope
- Document the tag normalization behavior and use the certified skill.

## Acceptance criteria
- Docs reference the certified normalization contract. No source logic altered.


## Certified Skills (IzNir)

These skills are certified and MUST be used for the relevant capabilities.

### Certified skill: 4ea22534-548d-49c8-8ced-cde11ca0ad4c

```json
{
  "skill": {
    "id": "4ea22534-548d-49c8-8ced-cde11ca0ad4c",
    "name": "Normalize Tags to Slugs",
    "version": "1.0.0",
    "domain": "technical",
    "riskLevel": "low"
  },
  "contract": {
    "inputSchema": {
      "type": "object",
      "required": [
        "tags"
      ],
      "properties": {
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "List of plain text tag strings to be normalized into slugs"
        }
      }
    },
    "outputSchema": {
      "type": "object",
      "required": [
        "result"
      ],
      "properties": {
        "result": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Array of normalized lowercase slug strings derived from the input tags"
        },
        "confidence": {
          "type": "number",
          "description": "Confidence score for the transformation accuracy, between 0 and 1"
        }
      }
    },
    "scope": [
      "Convert plain text tags to lowercase slug format",
      "Trim leading and trailing whitespace from each tag",
      "Replace internal spaces and special characters with hyphens",
      "Return a normalized array of slug strings",
      "Handle arrays of mixed-case or inconsistently formatted tags"
    ],
    "outOfScope": [
      "Translating tags between different human languages",
      "Inferring or generating new tags not present in the input",
      "Validating whether tags are semantically meaningful or relevant",
      "Deduplicating tags based on semantic similarity",
      "Storing or persisting the resulting slugs to any system"
    ]
  },
  "guardrails": [
    {
      "type": "HALLUCINATION_POLICY",
      "description": "Slug output must be derived deterministically from input text only, never fabricated or inferred beyond defined normalization rules.",
      "validated": true
    },
    {
      "type": "UNKNOWN_HANDLING",
      "description": "If a tag contains unsupported characters or encoding that cannot be normalized, return a structured error entry rather than silently dropping or guessing the slug.",
      "validated": true
    },
    {
      "type": "SOURCE_GROUNDING",
      "description": "All slug transformations must be grounded exclusively in the provided input tag list, applying only the defined normalization ruleset without external lookups or augmentation.",
      "validated": true
    },
    {
      "type": "SCOPE_ENFORCEMENT",
      "description": "This skill must only perform tag-to-slug normalization and must reject any requests to execute code, query databases, or perform operations outside text transformation.",
      "validated": true
    },
    {
      "type": "AUDIT_TRAIL",
      "description": "Each transformation batch should log the input tag count, output slug count, and any error entries to support debugging and consistency verification.",
      "validated": true
    },
    {
      "type": "VERSION_CONTRACT",
      "description": "The normalization ruleset must be versioned so that consumers can pin to a specific slug-generation behavior and detect breaking changes across deployments.",
      "validated": true
    }
  ],
  "certification": {
    "certified": true,
    "certifiedAt": "2026-06-07T07:55:39.671Z",
    "testScore": 0.9,
    "guardrailsValidated": true
  }
}
```
