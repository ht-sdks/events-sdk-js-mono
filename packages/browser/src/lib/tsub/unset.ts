import get from 'dlv'

export function unset(obj: any, prop: any) {
  if (get(obj, prop)) {
    const segs = prop.split('.')
    let last = segs.pop()
    while (segs.length && segs[segs.length - 1].slice(-1) === '\\') {
      last = segs.pop().slice(0, -1) + '.' + last
    }
    while (segs.length) obj = obj[(prop = segs.shift())]
    return delete obj[last]
  }
  return true
}
