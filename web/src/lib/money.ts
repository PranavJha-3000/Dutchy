export function formatPaise(paise: number): string {
  const negative = paise < 0
  const absolute = Math.abs(paise)
  const rupees = Math.trunc(absolute / 100)
  const fractional = absolute % 100
  const grouped = new Intl.NumberFormat('en-IN').format(rupees)
  return `${negative ? '-' : ''}₹${grouped}.${fractional.toString().padStart(2, '0')}`
}
