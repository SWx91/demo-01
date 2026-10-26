import type { CreateSupplierInput } from '@erp/contracts';
import { ORPCError } from '@orpc/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCurrentUser } from '@/lib/auth';
import { orpc } from '@/lib/orpc';

const DEFAULT_PAGE_SIZE = 20;

/** Administrator-maintained directory of suppliers, reusing the stores list conventions. */
export function SuppliersPage() {
  const user = useCurrentUser();
  const isAdmin = user?.role === 'ADMINISTRATOR';
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const suppliers = useQuery(
    orpc.suppliers.list.queryOptions({ input: { page, pageSize: DEFAULT_PAGE_SIZE } }),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: orpc.suppliers.list.key() });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">ผู้จัดจำหน่าย</h1>

      {isAdmin && <SupplierForm onSaved={invalidate} />}

      {suppliers.isPending ? (
        <p>กำลังโหลด…</p>
      ) : suppliers.isError ? (
        <p role="alert" className="text-destructive">
          ไม่สามารถโหลดรายการผู้จัดจำหน่ายได้ กรุณาลองใหม่อีกครั้ง
        </p>
      ) : suppliers.data.items.length === 0 ? (
        <p>ยังไม่มีผู้จัดจำหน่าย</p>
      ) : (
        <>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b">
                <th className="py-2">รหัสผู้จัดจำหน่าย</th>
                <th className="py-2">ชื่อผู้จัดจำหน่าย</th>
                <th className="py-2">ผู้ติดต่อ</th>
                <th className="py-2">โทรศัพท์</th>
                <th className="py-2">อีเมล</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.data.items.map((supplier) => (
                <tr key={supplier.id} className="border-b">
                  <td className="py-2">{supplier.code}</td>
                  <td className="py-2">{supplier.name}</td>
                  <td className="py-2">{supplier.contactName ?? '—'}</td>
                  <td className="py-2">{supplier.phone ?? '—'}</td>
                  <td className="py-2">{supplier.email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={suppliers.data.page}
            pageSize={suppliers.data.pageSize}
            total={suppliers.data.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">
        หน้า {page} จาก {lastPage}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ก่อนหน้า
        </Button>
        <Button
          variant="outline"
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          ถัดไป
        </Button>
      </div>
    </div>
  );
}

const EMPTY_FORM: CreateSupplierInput = {
  code: '',
  name: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
};

function SupplierForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState<CreateSupplierInput>(EMPTY_FORM);

  const create = useMutation(
    orpc.suppliers.create.mutationOptions({
      onSuccess: () => {
        setForm(EMPTY_FORM);
        onSaved();
      },
    }),
  );

  const field = (key: keyof CreateSupplierInput) => (event: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: event.target.value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>เพิ่มผู้จัดจำหน่าย</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(form);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="supplier-code">รหัสผู้จัดจำหน่าย</Label>
            <Input id="supplier-code" value={form.code} onChange={field('code')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-name">ชื่อผู้จัดจำหน่าย</Label>
            <Input id="supplier-name" value={form.name} onChange={field('name')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-contact">ผู้ติดต่อ</Label>
            <Input
              id="supplier-contact"
              value={form.contactName ?? ''}
              onChange={field('contactName')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-phone">โทรศัพท์</Label>
            <Input id="supplier-phone" value={form.phone ?? ''} onChange={field('phone')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-email">อีเมล</Label>
            <Input id="supplier-email" value={form.email ?? ''} onChange={field('email')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-address">ที่อยู่</Label>
            <Input id="supplier-address" value={form.address ?? ''} onChange={field('address')} />
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
          {create.isSuccess && (
            <p role="status" className="w-full text-sm text-muted-foreground">
              บันทึกผู้จัดจำหน่ายเรียบร้อยแล้ว
            </p>
          )}
          {create.isError && (
            <p role="alert" className="w-full text-destructive">
              {createErrorMessage(create.error)}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * The server's CONFLICT message is Thai and safe to show; any other error falls back to a generic
 * Thai sentence so no stack trace or English detail leaks. Uses the typed oRPC error, not ad-hoc casts.
 */
function createErrorMessage(error: Error): string {
  if (error instanceof ORPCError && error.code === 'CONFLICT') return error.message;
  return 'ไม่สามารถบันทึกผู้จัดจำหน่ายได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่';
}
