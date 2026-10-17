/** 发布渠道由构建注入；生产版本保持原存储键，预览版独立保存。 */
export const IS_DEV_PREVIEW = import.meta.env?.VITE_DEPLOY_CHANNEL === 'dev'
export const STORAGE_PREFIX = IS_DEV_PREVIEW ? 'slack-off-sect.dev' : 'slack-off-sect'
