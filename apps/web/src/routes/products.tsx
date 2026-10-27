import type { CreateProductInput, Product, UpdateProductInput } from '@erp/contracts';
import { ORPCError } from '@orpc/client';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCurrentUser } from '@/lib/auth';
import { orpc } from '@/lib/orpc';

/** The form's text fields; the price is entered in baht and converted to minor units on submit. */
type ProductForm = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  priceBaht: string;
};

const EMPTY_FORM: ProductForm = { sku: '', name: '', category: '', unit: '', priceBaht: '' };

/** Convert a baht amount (e.g. "125.00") to integer minor units (satang): 12500. */
function bahtToMinorUnits(baht: number): number {
  return Math.round(baht * 100);
}

/** Convert integer minor units (satang) back to a baht string for prefilling the form: 12500 → "125.00". */
function minorUnitsToBaht(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Parse a baht string to a finite number, or null when blank or not a number. */
function parseBaht(baht: string): number | null {
  const trimmed = baht.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

const INVALID_PRICE_MESSAGE = 'กรุณากรอกราคาขายให้ถูกต้อง';

/** Administrator-only screen to create products. SKU is unique across the organization. */
export function ProductsPage() {
  const user = useCurrentUser();
  const isAdmin = user?.role === 'ADMINISTRATOR';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">สินค้า</h1>
      {isAdmin ? (
        <ProductForm />
      ) : (
        <p className="text-muted-foreground">เฉพาะผู้ดูแลระบบเท่านั้นที่สร้างสินค้าได้</p>
      )}
    </div>
  );
}

function ProductForm() {
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [priceError, setPriceError] = useState<string | null>(null);

  const create = useMutation(
    orpc.products.create.mutationOptions({
      onSuccess: () => setForm(EMPTY_FORM),
    }),
  );

  const field = (key: keyof ProductForm) => (event: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: event.target.value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>เพิ่มสินค้า</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const baht = parseBaht(form.priceBaht);
            if (baht === null) {
              setPriceError(INVALID_PRICE_MESSAGE);
              return;
            }
            setPriceError(null);
            const input: CreateProductInput = {
              sku: form.sku,
              name: form.name,
              category: form.category,
              unit: form.unit,
              sellingPriceMinor: bahtToMinorUnits(baht),
              active: true,
            };
            create.mutate(input);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="product-sku">รหัสสินค้า (SKU)</Label>
            <Input id="product-sku" value={form.sku} onChange={field('sku')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-name">ชื่อสินค้า</Label>
            <Input id="product-name" value={form.name} onChange={field('name')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-category">หมวดหมู่</Label>
            <Input id="product-category" value={form.category} onChange={field('category')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-unit">หน่วยนับ</Label>
            <Input id="product-unit" value={form.unit} onChange={field('unit')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-price">ราคาขาย (บาท)</Label>
            <Input
              id="product-price"
              type="number"
              step="0.01"
              min="0"
              value={form.priceBaht}
              onChange={field('priceBaht')}
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
          {create.isSuccess && (
            <p role="status" className="w-full text-sm text-muted-foreground">
              บันทึกสินค้าเรียบร้อยแล้ว
            </p>
          )}
          {priceError ? (
            <p role="alert" className="w-full text-destructive">
              {priceError}
            </p>
          ) : (
            create.isError && (
              <p role="alert" className="w-full text-destructive">
                {createErrorMessage(create.error)}
              </p>
            )
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * The server's CONFLICT message is Thai and safe to show (e.g. a duplicate SKU); any other error
 * falls back to a generic Thai sentence so no stack trace or English detail leaks. Uses the typed
 * oRPC error, not ad-hoc casts.
 */
function createErrorMessage(error: Error): string {
  if (error instanceof ORPCError && error.code === 'CONFLICT') return error.message;
  return 'ไม่สามารถบันทึกสินค้าได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่';
}

/**
 * Administrator-only screen to edit a product's mutable fields (name, category, unit, selling
 * price, active status). The SKU is shown read-only — it is immutable in this ticket. Prefilled
 * from the product's current values; saves through the typed oRPC `update` route with Thai
 * loading/success/error states, reusing the same baht↔satang conversion as create.
 */
export function ProductEditForm({ product }: { product: Product }) {
  const [form, setForm] = useState<ProductForm>({
    sku: product.sku,
    name: product.name,
    category: product.category,
    unit: product.unit,
    priceBaht: minorUnitsToBaht(product.sellingPriceMinor),
  });
  const [active, setActive] = useState(product.active);
  const [priceError, setPriceError] = useState<string | null>(null);

  const update = useMutation(orpc.products.update.mutationOptions());

  const field = (key: keyof ProductForm) => (event: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: event.target.value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>แก้ไขสินค้า</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const baht = parseBaht(form.priceBaht);
            if (baht === null) {
              setPriceError(INVALID_PRICE_MESSAGE);
              return;
            }
            setPriceError(null);
            const input: UpdateProductInput = {
              id: product.id,
              name: form.name,
              category: form.category,
              unit: form.unit,
              sellingPriceMinor: bahtToMinorUnits(baht),
              active,
            };
            update.mutate(input);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="edit-product-sku">รหัสสินค้า (SKU)</Label>
            <Input id="edit-product-sku" value={form.sku} readOnly disabled />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-product-name">ชื่อสินค้า</Label>
            <Input id="edit-product-name" value={form.name} onChange={field('name')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-product-category">หมวดหมู่</Label>
            <Input id="edit-product-category" value={form.category} onChange={field('category')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-product-unit">หน่วยนับ</Label>
            <Input id="edit-product-unit" value={form.unit} onChange={field('unit')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-product-price">ราคาขาย (บาท)</Label>
            <Input
              id="edit-product-price"
              type="number"
              step="0.01"
              min="0"
              value={form.priceBaht}
              onChange={field('priceBaht')}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="edit-product-active"
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            <Label htmlFor="edit-product-active">เปิดใช้งาน</Label>
          </div>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
          {update.isSuccess && (
            <p role="status" className="w-full text-sm text-muted-foreground">
              บันทึกสินค้าเรียบร้อยแล้ว
            </p>
          )}
          {priceError ? (
            <p role="alert" className="w-full text-destructive">
              {priceError}
            </p>
          ) : (
            update.isError && (
              <p role="alert" className="w-full text-destructive">
                {createErrorMessage(update.error)}
              </p>
            )
          )}
        </form>
      </CardContent>
    </Card>
  );
}
