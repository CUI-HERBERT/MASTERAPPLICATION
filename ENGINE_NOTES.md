# Evaluation engine

Pure browser-compatible ES module at `web/engine.js`. The module does not fetch data or persist profiles. UI owns `programs.json`, browser storage, import/export and field-level descriptions.

Exports: `DEFAULT_PROFILE` (`defaultProfile` alias), `PROFILE_OPTIONS`, `TIER_ORDER`, `RULE_VERSION`, `POLICY_NOTES`, `GPA_RULES`, `normalizeProfile`, `getGpaGate`, `evaluateProgram`, `evaluatePrograms`, `summarize`, `getPlanningSuggestions`.

`evaluateProgram(record,profile)` returns the original record plus top-level evaluation fields and the same fields in `.evaluation`. `tier`, `baselineTier`, `userTier`, `reasons[]`, `nextSteps[]`, `flags[{kind,label,detail}]`, `gpaGate`, `researchFit`, `greEffect`, `languageStatus`, `changed` are presentation-ready. `evaluatePrograms` filters intended degree; it does not sort.

`gpaGate.status`: `below` / `met` (explicit target numeric standards); `guide-below` / `guide-met` (UNSW numeric calculator only); `unknown` (all unsupported numerical equivalences). Text must describe official thresholds as dated reference requirements, never guarantees or automatic rejection. Only an explicit ID allowlist can produce a numeric gate. In particular ETH numbers in exclusions, UBC MEng unconfirmed applicability, fee-waiver thresholds, NZ letters and adviser targets do not become gates.

Anchors preserve stored qualitative 4.1 / 4.5 judgements. Between anchors use the 4.1 tier conservatively. Once a verified grade gate is crossed, use the 4.5 competitive tier with a conservative one-tier adjustment below 4.5. Above4.5 no further automatic benefit; below4.1 one-tier conservative extrapolation, explicitly flagged. Soft-evidence movement is at most one tier; structural conditional candidates remain conditional. MIT and Princeton remain extreme reach; Stanford cannot become safer than reach. Program-specific conditions remain visible even when they do not set the whole tier.

`batteryOutputs` counts only accepted/published experimental battery outputs, not generic ML articles or future Q1 aims. Quantity has no standalone rank effect. Recommendation `promised` differs from specific evidence, `available` connection differs from academic feedback, both differ from admission. Global prerequisite/research-preparation switches cannot grant project-specific equivalence or laboratory access. Optional `programEvidence[id]` can record `{supervisor,prerequisites,conditions,language:'confirmed'}`; this records user evidence, not an independently verified admissions decision.

The interpretation and conditional list must remain alongside every output. These are editable planning rules with no fitted probabilities. Refresh target admission policies separately; profile edits do not refresh policy data.

`web/gaps.js` adds `buildProgramGapAnalysis(record, profile, portfolioItems)`. It reports current evidence, a concrete target, effect and status for each preparation area, using dated programme requirements for official conditions. Its prospective tier evaluates an explicitly described counterfactual; it is not a statistical forecast. Portfolio edits supply named evidence but never silently mutate the research-depth selectors. Uncertain publications, authorship, dates and prospective recommenders remain uncertain.

The 2026-11-09 representative official refresh reconfirmed MIT DMSE and ChemE MSCEP do not accept GRE; the DMSE 3.9 condition belongs to fee-waiver eligibility, not admission. Cambridge's Singapore qualifications table still distinguishes NUS 4.00 (2:1), 4.25 (High 2:1), and 4.50 (First). This is not a fresh audit of all 152 policies. Original per-programme dates remain displayed.
