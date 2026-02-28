/**
 * Butterfly
 * ramdom cover
 */

'use strict'

hexo.extend.filter.register('before_post_render', data => {
  const imgTestReg = /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i
  let { cover: coverVal, top_img: topImg } = data

  // Add path to top_img and cover if post_asset_folder is enabled
if (hexo.config.post_asset_folder) {
  // 先检查 topImg 是字符串，再执行 indexOf 操作
  if (typeof topImg === 'string' && topImg.indexOf('/') === -1 && imgTestReg.test(topImg)) {
    data.top_img = `${data.path}${topImg}`;
  }
  // 同理检查 coverVal 是字符串
  if (typeof coverVal === 'string' && coverVal.indexOf('/') === -1 && imgTestReg.test(coverVal)) {
    data.cover = `${data.path}${coverVal}`;
  }
}
  const randomCoverFn = () => {
    const { cover: { default_cover: defaultCover } } = hexo.theme.config
    if (!defaultCover) return false
    if (!Array.isArray(defaultCover)) return defaultCover
    const num = Math.floor(Math.random() * defaultCover.length)
    return defaultCover[num]
  }

  const shouldCacheBust = () => {
    const coverConfig = (hexo.theme.config && hexo.theme.config.cover) || {}
    return coverConfig.cache_bust === true
  }

  if (coverVal === false) return data

  const uuid = () => {
    var timestamp = new Date().getTime()
    return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (timestamp + Math.random() * 16) % 16 | 0
      timestamp = Math.floor(timestamp / 16)
      return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
  }

  const addUuidToUrl = (url) => {
    try {
      let urlParts = new URL(url)
      let params = urlParts.searchParams
      if (params.size > 0) {
        params.append('_r_', uuid())
      } else {
        params.set('_r_', uuid())
      }
      return urlParts.toString()
    } catch (error) {
      return url
    }
  }

  // If cover is not set, use random cover
  if (!coverVal) {
    const randomCover = randomCoverFn()
    const cover = randomCover && shouldCacheBust() ? addUuidToUrl(randomCover) : randomCover
    data.cover = cover
    coverVal = cover // update coverVal
  }

  if (coverVal && (coverVal.indexOf('//') !== -1 || imgTestReg.test(coverVal))) {
    data.cover_type = 'img'
  }

  return data
})
