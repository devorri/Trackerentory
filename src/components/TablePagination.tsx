type Props = {
  page: number
  totalItems: number
  onPageChange: (page: number) => void
  pageSize?: number
}

export const DEFAULT_PAGE_SIZE = 10

export default function TablePagination({ page, totalItems, onPageChange, pageSize = DEFAULT_PAGE_SIZE }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (totalItems <= pageSize) return null
  const currentPage = Math.min(page, totalPages)
  return (
    <div className="table-pagination no-print">
      <span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalItems)} of {totalItems}</span>
      <div>
        <button type="button" className="btn-ghost" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>Previous</button>
        <span>Page {currentPage} of {totalPages}</span>
        <button type="button" className="btn-ghost" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)}>Next</button>
      </div>
    </div>
  )
}
