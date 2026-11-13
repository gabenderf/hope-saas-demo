export { buildActivityFeed, buildOperatorDetail } from './detail';
export { buildCustomPeriod, buildPeriodModel, buildRangeOverview } from './period';
export type { PeriodRequest, PeriodSpec } from './period';
export { buildTodayOverview } from './today';
export { currentUndo, withUndo } from './undo';
export { lastWorkedWeekdays, resolveGlobalGoal, workedWeekdays } from './common';

import type { CompareKey, OperationsSource, OverviewModel, RangeKey } from '../types';
import { buildRangeOverview } from './period';
import { buildTodayOverview } from './today';

/** Visão Geral conforme o período escolhido. */
export function buildOverview(
  source: OperationsSource,
  params: { range: RangeKey; compare: CompareKey },
): Promise<OverviewModel> {
  return params.range === 'hoje' ? buildTodayOverview(source, params.compare) : buildRangeOverview(source, params.range);
}
