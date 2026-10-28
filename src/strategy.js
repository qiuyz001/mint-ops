export function buildStrategyCard(event, config) {
  const strategy = config.strategy;
  const reasons = [];
  const ageSec = event.blockTime ? Math.max(0, Math.floor(event.seenAt / 1000 - event.blockTime)) : null;
  if (ageSec == null || ageSec > strategy.maxNewTokenAgeSec) reasons.push('事件不是新鲜新盘');
  if (event.quote && !strategy.quotes.includes(String(event.quote).toUpperCase())) reasons.push(`报价币 ${event.quote} 不在范围`);
  if ((event.buyTaxBps ?? 0) > strategy.maxBuyTaxBps) reasons.push('买入税超过上限');
  if ((event.sellTaxBps ?? 0) > strategy.maxSellTaxBps) reasons.push('卖出税超过上限');
  const eligible = reasons.length === 0;
  return {
    kind: 'launchpad_simulation',
    action: 'preview_only',
    eligible,
    reasons: eligible ? ['满足本地模拟条件；未报价、未下单'] : reasons,
    token: event.token,
    platform: event.platform,
    ageSec,
    quote: event.quote || null,
    entry: { mode: 'signal_only', amountBnb: null },
    exit: {
      takeProfit: strategy.takeProfit,
      stopLossPct: strategy.stopLossPct,
      maxHoldHours: strategy.maxHoldHours,
    },
    risk: '新盘可能归零或无法卖出；本卡不是买入建议，也不是成交承诺。',
  };
}
