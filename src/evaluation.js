import { deepFreezeJson } from "./canonical.js";

function uniqueStrings(value, label) {
  if (!Array.isArray(value) || value.length > 100_000 || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new TypeError(`${label} must be an array of non-empty strings.`);
  }
  return new Set(value);
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 10_000) / 10_000;
}

function overlap(left, right) {
  let count = 0;
  for (const item of left) if (right.has(item)) count += 1;
  return count;
}

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000_000) {
    throw new TypeError(`${label} must be a finite non-negative number.`);
  }
  return value;
}

export function evaluateContextQuality(cases) {
  if (!Array.isArray(cases) || cases.length === 0 || cases.length > 10_000) {
    throw new TypeError("cases must contain from 1 to 10000 evaluation cases.");
  }
  const totals = {
    requiredDecisions: 0,
    recalledDecisions: 0,
    returnedCitations: 0,
    validCitations: 0,
    expectedStale: 0,
    rejectedStale: 0,
    expectedConflicts: 0,
    detectedConflicts: 0,
    expectedSuperseded: 0,
    resolvedSuperseded: 0,
    crossRepositoryAttempts: 0,
    rejectedCrossRepository: 0,
    expectedUnauthorized: 0,
    rejectedUnauthorized: 0,
    baselineContextTokens: 0,
    contextTokensSupplied: 0,
    completedTasks: 0,
    repeatedMistakes: 0,
    avoidedRepeatedMistakes: 0,
    baselineCost: 0,
    actualCost: 0,
    latencyMs: 0
  };
  const results = cases.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`cases[${index}] must be an object.`);
    }
    const id = typeof entry.id === "string" && entry.id.length > 0 ? entry.id : `case-${index + 1}`;
    const required = uniqueStrings(entry.requiredDecisionIds ?? [], `${id}.requiredDecisionIds`);
    const recalled = uniqueStrings(entry.recalledDecisionIds ?? [], `${id}.recalledDecisionIds`);
    const returned = uniqueStrings(entry.returnedCitationIds ?? [], `${id}.returnedCitationIds`);
    const valid = uniqueStrings(entry.validCitationIds ?? [], `${id}.validCitationIds`);
    const stale = uniqueStrings(entry.expectedStaleIds ?? [], `${id}.expectedStaleIds`);
    const rejected = uniqueStrings(entry.rejectedStaleIds ?? [], `${id}.rejectedStaleIds`);
    const conflicts = uniqueStrings(entry.expectedConflictIds ?? [], `${id}.expectedConflictIds`);
    const detected = uniqueStrings(entry.detectedConflictIds ?? [], `${id}.detectedConflictIds`);
    const superseded = uniqueStrings(entry.expectedSupersededIds ?? [], `${id}.expectedSupersededIds`);
    const resolvedSuperseded = uniqueStrings(entry.resolvedSupersededIds ?? [], `${id}.resolvedSupersededIds`);
    const crossRepository = uniqueStrings(entry.crossRepositoryAttemptIds ?? [], `${id}.crossRepositoryAttemptIds`);
    const rejectedCrossRepository = uniqueStrings(entry.rejectedCrossRepositoryIds ?? [], `${id}.rejectedCrossRepositoryIds`);
    const unauthorized = uniqueStrings(entry.expectedUnauthorizedIds ?? [], `${id}.expectedUnauthorizedIds`);
    const rejectedUnauthorized = uniqueStrings(entry.rejectedUnauthorizedIds ?? [], `${id}.rejectedUnauthorizedIds`);
    const latencyMs = finiteNonNegative(entry.latencyMs ?? 0, `${id}.latencyMs`);
    const baselineCost = finiteNonNegative(entry.baselineCost ?? 0, `${id}.baselineCost`);
    const actualCost = finiteNonNegative(entry.actualCost ?? 0, `${id}.actualCost`);
    const baselineContextTokens = finiteNonNegative(entry.baselineContextTokens ?? 0, `${id}.baselineContextTokens`);
    const contextTokensSupplied = finiteNonNegative(entry.contextTokensSupplied ?? 0, `${id}.contextTokensSupplied`);
    const recalledCount = overlap(required, recalled);
    const validCitationCount = overlap(returned, valid);
    const rejectedStaleCount = overlap(stale, rejected);
    const detectedConflictCount = overlap(conflicts, detected);
    const resolvedSupersededCount = overlap(superseded, resolvedSuperseded);
    const rejectedCrossRepositoryCount = overlap(crossRepository, rejectedCrossRepository);
    const rejectedUnauthorizedCount = overlap(unauthorized, rejectedUnauthorized);
    const repeatedMistakeExpected = entry.repeatedMistakeExpected === true;
    const repeatedMistakeAvoided = repeatedMistakeExpected && entry.repeatedMistakeAvoided === true;
    Object.assign(totals, {
      requiredDecisions: totals.requiredDecisions + required.size,
      recalledDecisions: totals.recalledDecisions + recalledCount,
      returnedCitations: totals.returnedCitations + returned.size,
      validCitations: totals.validCitations + validCitationCount,
      expectedStale: totals.expectedStale + stale.size,
      rejectedStale: totals.rejectedStale + rejectedStaleCount,
      expectedConflicts: totals.expectedConflicts + conflicts.size,
      detectedConflicts: totals.detectedConflicts + detectedConflictCount,
      expectedSuperseded: totals.expectedSuperseded + superseded.size,
      resolvedSuperseded: totals.resolvedSuperseded + resolvedSupersededCount,
      crossRepositoryAttempts: totals.crossRepositoryAttempts + crossRepository.size,
      rejectedCrossRepository: totals.rejectedCrossRepository + rejectedCrossRepositoryCount,
      expectedUnauthorized: totals.expectedUnauthorized + unauthorized.size,
      rejectedUnauthorized: totals.rejectedUnauthorized + rejectedUnauthorizedCount,
      baselineContextTokens: totals.baselineContextTokens + baselineContextTokens,
      contextTokensSupplied: totals.contextTokensSupplied + contextTokensSupplied,
      completedTasks: totals.completedTasks + (entry.taskCompleted === true ? 1 : 0),
      repeatedMistakes: totals.repeatedMistakes + (repeatedMistakeExpected ? 1 : 0),
      avoidedRepeatedMistakes: totals.avoidedRepeatedMistakes + (repeatedMistakeAvoided ? 1 : 0),
      baselineCost: totals.baselineCost + baselineCost,
      actualCost: totals.actualCost + actualCost,
      latencyMs: totals.latencyMs + latencyMs
    });
    return {
      id,
      decisionRecall: ratio(recalledCount, required.size),
      citationAccuracy: ratio(validCitationCount, returned.size),
      staleContextRejection: ratio(rejectedStaleCount, stale.size),
      conflictDetection: ratio(detectedConflictCount, conflicts.size),
      supersessionCorrectness: ratio(resolvedSupersededCount, superseded.size),
      crossRepositoryIsolation: ratio(rejectedCrossRepositoryCount, crossRepository.size),
      unauthorizedDisclosureRejection: ratio(rejectedUnauthorizedCount, unauthorized.size),
      taskCompleted: entry.taskCompleted === true,
      repeatedMistakeAvoided: repeatedMistakeExpected ? repeatedMistakeAvoided : null,
      latencyMs,
      baselineCost,
      actualCost,
      baselineContextTokens,
      contextTokensSupplied
    };
  });
  return deepFreezeJson({
    schemaVersion: "qarinah.context-quality-evaluation.v1",
    caseCount: cases.length,
    metrics: {
      decisionRecall: ratio(totals.recalledDecisions, totals.requiredDecisions),
      citationAccuracy: ratio(totals.validCitations, totals.returnedCitations),
      staleContextRejection: ratio(totals.rejectedStale, totals.expectedStale),
      conflictDetection: ratio(totals.detectedConflicts, totals.expectedConflicts),
      supersessionCorrectness: ratio(totals.resolvedSuperseded, totals.expectedSuperseded),
      crossRepositoryIsolation: ratio(totals.rejectedCrossRepository, totals.crossRepositoryAttempts),
      unauthorizedDisclosureRejection: ratio(totals.rejectedUnauthorized, totals.expectedUnauthorized),
      contextTokensSupplied: totals.contextTokensSupplied,
      contextTokenReduction: totals.baselineContextTokens === 0
        ? null
        : Math.round(((totals.baselineContextTokens - totals.contextTokensSupplied) / totals.baselineContextTokens) * 10_000) / 10_000,
      taskCompletionQuality: ratio(totals.completedTasks, cases.length),
      repeatedMistakePrevention: ratio(totals.avoidedRepeatedMistakes, totals.repeatedMistakes),
      meanLatencyMs: Math.round((totals.latencyMs / cases.length) * 100) / 100,
      costPerCompletedTask: totals.completedTasks === 0
        ? null
        : Math.round((totals.actualCost / totals.completedTasks) * 1_000_000) / 1_000_000,
      netCostPerCompletedTask: totals.completedTasks === 0
        ? null
        : Math.round((totals.actualCost / totals.completedTasks) * 1_000_000) / 1_000_000,
      costReduction: totals.baselineCost === 0
        ? null
        : Math.round(((totals.baselineCost - totals.actualCost) / totals.baselineCost) * 10_000) / 10_000
    },
    totals,
    cases: results
  });
}
