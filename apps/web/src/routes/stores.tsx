import type { CreateStoreInput } from '@erp/contracts';
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

/** Administrator-only directory of stores, and the list conventions later lists reuse. */
export function StoresPage() {
  const user = useCurrentUser();
  const isAdmin = user?.role === 'ADMINISTRATOR';
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const stores = useQuery(
    orpc.stores.list.queryOptions({ input: { page, pageSize: DEFAULT_PAGE_SIZE } }),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: orpc.stores.list.key() });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">สาขา</h1>

      {isAdmin && <StoreForm onSaved={invalidate} />}

      {stores.isPending ? (
        <p>กำลังโหลด…</p>
      ) : stores.isError ? (
        <p role="alert" className="text-destructive">
          ไม่สามารถโหลดรายการสาขาได้ กรุณาลองใหม่อีกครั้ง
        </p>
      ) : stores.data.items.length === 0 ? (
        <p>ยังไม่มีสาขา</p>
      ) : (
        <>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b">
                <th className="py-2">รหัสสาขา</th>
                <th className="py-2">ชื่อสาขา</th>
              </tr>
            </thead>
            <tbody>
              {stores.data.items.map((store) => (
                <tr key={store.id} className="border-b">
                  <td className="py-2">{store.code}</td>
                  <td className="py-2">{store.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={stores.data.page}
            pageSize={stores.data.pageSize}
            total={stores.data.total}
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

function StoreForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState<CreateStoreInput>({ code: '', name: '' });

  const create = useMutation(
    orpc.stores.create.mutationOptions({
      onSuccess: () => {
        setForm({ code: '', name: '' });
        onSaved();
      },
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>เพิ่มสาขา</CardTitle>
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
            <Label htmlFor="store-code">รหัสสาขา</Label>
            <Input
              id="store-code"
              value={form.code}
              onChange={(event) => setForm((f) => ({ ...f, code: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="store-name">ชื่อสาขา</Label>
            <Input
              id="store-name"
              value={form.name}
              onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
          {create.isSuccess && (
            <p role="status" className="w-full text-sm text-muted-foreground">
              บันทึกสาขาเรียบร้อยแล้ว
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
  return 'ไม่สามารถบันทึกสาขาได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่';
}
