/**
 * framework_sdk_cli — Agent CLI 基建（根聚合导出）。
 *
 * 子包目录：
 * - envelope/  进程信封 + exit
 * - argv/      flag / 命名参数解析
 * - http/      Bearer fetch + WorkerIo → 进程信封
 * - portal/    registerTool / runPortal
 * - search/    门户级 search 引擎
 */
export * from './argv/index.js';
export * from './envelope/index.js';
export * from './http/index.js';
export * from './portal/index.js';
export * from './search/index.js';
