import React from 'react'

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />
}

export function SkeletonCard() {
  return (
    <div className="card product-card" style={{ opacity: 0.85 }}>
      <div className="card-media">
        <Skeleton style={{ width: '100%', height: '100%' }} />
      </div>
      <div className="card-body">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Skeleton style={{ width: '60px', height: '22px', borderRadius: '6px' }} />
          <Skeleton style={{ width: '70px', height: '22px', borderRadius: '6px' }} />
        </div>
        <Skeleton style={{ width: '85%', height: '24px', margin: '0.4rem 0 0.2rem', borderRadius: '6px' }} />
        <Skeleton style={{ width: '100%', height: '16px', borderRadius: '4px' }} />
        <Skeleton style={{ width: '60%', height: '16px', borderRadius: '4px' }} />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: '0.75rem' }}>
          <Skeleton style={{ width: '90px', height: '28px', borderRadius: '6px' }} />
        </div>
        <Skeleton style={{ width: '100%', height: '42px', marginTop: '0.75rem', borderRadius: '12px' }} />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <Skeleton style={{ width: '80px', height: '16px', borderRadius: '4px' }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <Skeleton style={{ width: c === 0 ? '140px' : '70px', height: '18px', borderRadius: '4px' }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SkeletonStat() {
  return (
    <div className="stat">
      <Skeleton style={{ width: '100px', height: '14px', borderRadius: '4px' }} />
      <Skeleton style={{ width: '140px', height: '36px', marginTop: '0.6rem', borderRadius: '8px' }} />
    </div>
  )
}
