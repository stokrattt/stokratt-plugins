# Checklist rules: reference

Sources: ISTQB CTFL v4.0, ISTQB CTAL-TA v4.0, requirements-based testing.

## What a checklist item is

Per ISTQB, a test condition is an aspect of a component or system that can be
verified by one or more test cases. A checklist item is an atomic test
condition with an unambiguous expected result.

A checklist item answers "what to check and what result is expected".
A test case (step4) answers "how to check it".

## Item class: structural / behavioral

The definitions of both tags and the technique mapping are in `../SKILL.md`, Step 3. That is the only
place they are defined; do not repeat them here. The tag is set in the checklist (a refinement of the
existing technique tag, see output-template) and from then on is the source of truth for step4. The
human sees it in the checklist and can correct it before test cases are generated.

## Quality attributes of an item

- **Atomicity.** One item = one check with one pass/fail.
  "The button is visible and clickable" is two items.
- **Traceability.** Every item has a REQ-ID. Every requirement has at least one item.
- **Unambiguity.** Any two people reach the same pass/fail conclusion.
- **Self-sufficiency.** The item is understandable without opening the requirements file.
- **Independence.** The item can be checked on its own.
- **No duplication.** A check is not repeated.
- **Consistency.** Elements of the same type get an identical base set.

## Wording rules

Item = what is checked (element/state/behavior) + what the expected
result is (value/state/text). Both parts are required.

### Forbidden words

"correctly", "properly", "appropriately", "relevant", "adequate",
"if needed", "several", "some", "quickly", "smoothly", "conveniently",
"looks good", "works fine". Use specifics instead.

## Decomposing a requirement into items

For each requirement, determine in order:

1. Which elements or states the requirement describes
2. Which actions or behaviors the requirement describes
3. Which conditions or constraints the requirement describes
4. Whether there are dependencies on other requirements

Each finding from steps 1 to 4 with an unambiguous pass/fail becomes a checklist item.

### Check types (only those that follow from the requirement)

- **Positive scenario**: the main behavior (happy path). Always.
- **Negative scenario**: invalid actions/data. When there is interactivity.
- **Boundary values**: at the limits. When there are numeric/text constraints.
- **Default state**: the initial state. When there is an initial state.
- **Element states**: visibility/enabled under conditions. When there is conditional behavior.
- **State transitions**: state change on an action. When there is a state change.
- **Reset**: return to the initial state. When there is a reset/clear.
- **Validation**: rules and messages. When there is validation.
- **Data**: fields, formats, mappings. When there are specific fields/formats.
- **Condition combinations**: when there are several independent conditions.
- **UI conformance**: labels/texts/positions. When the requirement describes them.

### Checks at the seams between requirements

After decomposing each requirement, check groups of related requirements.
The seams can hide dependencies, conflicts and shared states.

## Sufficiency criterion

**Enough when:** every requirement has at least one check; every item is
one pass/fail; every item is understandable without context; elements of the
same type get the same base set.

**Too much when:** items duplicate each other; 10+ items for a simple
requirement with one element; an item checks a detail the requirement does not have.

## Base set for typical elements

A starting point: generate only the items that follow from the requirement.

- **Select:** presence -> type -> options -> default state -> main action -> reset
- **Input field:** presence -> type -> label -> placeholder -> default ->
  validation -> constraints
- **Button:** presence -> text -> action on click -> states and transition conditions
- **Table/list:** presence -> columns -> data -> sorting ->
  pagination -> empty state

## Filtering out unneeded checks

Do not generate checks for: standard browser/platform behavior;
implementation details (architecture/cache/libraries); general infrastructure
(server errors/timeouts); boundary values with no limits in the requirement;
negative scenarios for requirements with no interactivity; UX details
(animations/timings/hover) the requirement does not describe.

## Antipatterns

- **Duplication by rewording**: "is present" and "is displayed" = one item.
- **Implementation instead of behavior**: "API returns 200" is not for the checklist.
- **Non-atomic item**: "is present and filters" = two items.
- **Dependent item**: "after REQ-1.2..." = it must be self-sufficient.
- **Invented check**: "loads in 2 seconds" with no performance requirement.
- **Ambiguous wording**: "works correctly" = name the concrete result.
