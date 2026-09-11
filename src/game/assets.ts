// 公開先のベースパス（GitHub Pages のサブディレクトリなど）を考慮して
// public/ 配下のアセット URL を解決する。
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
