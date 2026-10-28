export function assertExecutionAllowed(config, project, state, { automatic = false } = {}) {
  if (!project.execution) throw new Error(`${project.name} 没有执行配置`);
  if (!config.execution.armed) throw new Error('执行未 armed；默认只读/预览');
  if (!config.execution.allowedProjects.includes(project.id)) throw new Error(`${project.id} 不在执行白名单`);
  if (project.execution.value !== '0') throw new Error('当前执行层仅允许 value=0 的免费 mint');
  if (automatic && project.execution.autoAllowed !== true) throw new Error(`${project.id} 未允许自动执行`);
  if (project.execution.autoAllowed !== true) throw new Error(`${project.id} 的 autoAllowed 仍为 false，需人工核验后显式修改配置`);
  if (!state || state.errors.length) throw new Error('链上前置读取不完整，禁止执行');
}

export function validatePreview(preview) {
  const risks = preview.risks?.riskDetails || [];
  if (risks.length) throw new Error(`预览存在风险提示：${risks.map((x) => x.title || x.code).join('、')}`);
  if (preview.requireConfirmation) {
    const error = new Error('该交易需要币安 App 确认，已停止自动执行');
    error.code = 'APP_CONFIRM';
    throw error;
  }
  if (!preview.requestId) throw new Error('预览未返回 requestId，禁止 execute');
}
