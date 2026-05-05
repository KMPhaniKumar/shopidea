'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Download, Edit2, Trash2, Eye, EyeOff, Package } from 'lucide-react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import toast, { Toaster } from 'react-hot-toast'
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, flexRender, type ColumnDef,
} from '@tanstack/react-table'

export default function ProductsPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [storeId, setStoreId] = useState<string>('')

  useEffect(() => { loadProducts() }, [])

  async function loadProducts() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: store } = await supabase.from('stores').select('id').eq('seller_id', user.id).single()
    if (!store) return
    setStoreId(store.id)
    const { data } = await supabase.from('products').select('*').eq('store_id', store.id).order('created_at', { ascending: false })
    setProducts(data ?? [])
  }

  async function toggleAvailability(id: string, current: boolean) {
    await supabase.from('products').update({ is_available: !current }).eq('id', id)
    toast.success(!current ? 'Product visible' : 'Product hidden')
    loadProducts()
  }

  async function deleteProduct(id: string) {
    if (!confirm('Delete this product?')) return
    await supabase.from('products').delete().eq('id', id)
    toast.success('Product deleted')
    loadProducts()
  }

  async function bulkDelete() {
    const ids = Object.keys(selected).filter(k => selected[k]).map(i => products[Number(i)]?.id).filter(Boolean)
    if (!confirm(`Delete ${ids.length} products?`)) return
    await supabase.from('products').delete().in('id', ids)
    setSelected({})
    toast.success('Products deleted')
    loadProducts()
  }

  function exportExcel() {
    const data = products.map(p => ({
      'Name': p.name,
      'Price (₹)': p.price,
      'Compare Price (₹)': p.compare_price ?? '',
      'Stock': p.stock_quantity === -1 ? 'Unlimited' : p.stock_quantity,
      'Category': p.category ?? '',
      'Available': p.is_available ? 'Yes' : 'No',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')
    XLSX.writeFile(wb, `reelmart-products-${Date.now()}.xlsx`)
  }

  const selectedCount = Object.values(selected).filter(Boolean).length

  const columns: ColumnDef<any>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input type="checkbox" checked={table.getIsAllRowsSelected()} onChange={table.getToggleAllRowsSelectedHandler()} />
      ),
      cell: ({ row }) => (
        <input type="checkbox" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
      ),
    },
    {
      accessorKey: 'images',
      header: 'Photo',
      cell: ({ getValue }) => {
        const imgs = getValue() as string[]
        return imgs?.[0] ? (
          <img src={imgs[0]} alt="" className="w-10 h-10 object-cover rounded-lg" />
        ) : (
          <div className="w-10 h-10 bg-[#F9F9F9] rounded-lg flex items-center justify-center text-[#AAAAAA] text-xs">No img</div>
        )
      },
    },
    { accessorKey: 'name', header: 'Product Name' },
    { accessorKey: 'category', header: 'Category', cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'price', header: 'Price', cell: ({ getValue }) => `₹${getValue()}` },
    {
      accessorKey: 'stock_quantity',
      header: 'Stock',
      cell: ({ getValue }) => {
        const v = getValue() as number
        if (v === -1) return <span className="text-[#25D366] text-xs font-medium">Unlimited</span>
        if (v <= 3) return <span className="text-[#E23744] text-xs font-medium">{v} left</span>
        return <span className="text-sm">{v}</span>
      },
    },
    {
      accessorKey: 'is_available',
      header: 'Status',
      cell: ({ getValue }) => getValue()
        ? <span className="bg-[#25D366]/10 text-[#25D366] text-xs font-medium px-2 py-0.5 rounded-full">Visible</span>
        : <span className="bg-[#EEEEEE] text-[#AAAAAA] text-xs font-medium px-2 py-0.5 rounded-full">Hidden</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button onClick={() => toggleAvailability(row.original.id, row.original.is_available)} className="p-1.5 hover:bg-[#F9F9F9] rounded">
            {row.original.is_available ? <EyeOff size={15} className="text-[#666666]" /> : <Eye size={15} className="text-[#666666]" />}
          </button>
          <Link href={`/seller/products/${row.original.id}`} className="p-1.5 hover:bg-[#F9F9F9] rounded">
            <Edit2 size={15} className="text-[#666666]" />
          </Link>
          <button onClick={() => deleteProduct(row.original.id)} className="p-1.5 hover:bg-[#F9F9F9] rounded">
            <Trash2 size={15} className="text-[#E23744]" />
          </button>
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
    state: { globalFilter: search, rowSelection: selected },
    onGlobalFilterChange: setSearch,
    onRowSelectionChange: setSelected,
    getRowId: (row) => row.id,
  })

  return (
    <div className="space-y-4">
      <Toaster />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1A1A1A]">Products</h1>
        <div className="flex gap-2">
          {selectedCount > 0 && (
            <button onClick={bulkDelete} className="px-3 py-2 bg-[#E23744] text-white text-sm rounded-lg font-medium">
              Delete {selectedCount}
            </button>
          )}
          <button onClick={exportExcel} className="px-3 py-2 border border-[#EEEEEE] text-sm rounded-lg flex items-center gap-2 hover:bg-[#F9F9F9]">
            <Download size={15} /> Export
          </button>
          <Link href="/seller/products/new" className="px-4 py-2 bg-[#FF6B2B] text-white text-sm rounded-lg flex items-center gap-2 font-medium hover:bg-[#e55a1f]">
            <Plus size={15} /> Add Product
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-4 border-b border-[#EEEEEE]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AAAAAA]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-[#EEEEEE] rounded-lg outline-none focus:border-[#FF6B2B]"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} className="border-b border-[#EEEEEE]">
                  {hg.headers.map(h => (
                    <th key={h.id} className="text-left text-xs font-medium text-[#666666] px-4 py-3">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="border-b border-[#EEEEEE] hover:bg-[#F9F9F9]">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3 text-sm text-[#1A1A1A]">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && (
            <div className="text-center py-16 text-[#AAAAAA]">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p>No products yet. Add your first product!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
