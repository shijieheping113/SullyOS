/**
 * 二改：不要作者「版本来源提醒」弹窗，也不拦截开机流程。
 * 组件与检测工具仍留在仓库，只是这里永远放行。
 */
export function useDeploymentNotice() {
  return {
    source: 'official' as const,
    blocked: false,
    accept: () => {},
  };
}
