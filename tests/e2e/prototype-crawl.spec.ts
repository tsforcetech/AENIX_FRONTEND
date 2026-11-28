import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/** Visits every prototype screen per persona: renders a heading, no runtime errors, no WCAG 2.1 AA violations. */
const staffPaths = [
  '/home',
  '/enquiries',
  '/enquiries/enq-1084',
  '/enquiries/new',
  '/quotations',
  '/quotations/qt-1083',
  '/quotations/new?enquiryId=enq-1073',
  '/sales-orders',
  '/sales-orders/so-5110',
  '/sales-orders/new?quotationId=qt-1083',
  '/contracts',
  '/contracts/ctr-1',
  '/work-orders',
  '/work-orders/wo-2049',
  '/work-orders/new',
  '/work-orders/wo-2052',
  '/work-orders/wo-2053',
  '/work-orders/wo-2054',
  '/work-orders/new?salesOrderId=so-5110',
  '/vendor-bills/bill-2053-0',
  '/warehouse',
  '/storage-billing',
  '/invoices',
  '/invoices/inv-3029',
  '/vendor-bills',
  '/collections',
  '/purchase-orders',
  '/purchase-orders/po-6103',
  '/purchase-orders/po-6101',
  '/vendor-bills/new?purchaseOrderId=po-6103',
  '/invoices/new?customerId=cus-7',
  '/payments',
  '/payments/new',
  '/accounting?view=accounts',
  '/customers/new',
  '/collections/new',
  '/accounting',
  '/customers',
  '/customers/cus-3',
  '/vendors',
  '/services',
  '/reports',
  '/settings',
  // FLOW-003
  '/approvals',
  '/audit',
  '/fleet',
  '/variances',
  '/warehouse/locations',
  '/warehouse/cycle-counts',
  '/collections/pdc',
  '/collections/follow-up',
  '/vendor-bills/debit-notes',
  '/expenses',
  '/accounting/accruals',
  '/accounting/bank-reconciliation',
  '/accounting/vat-return',
  '/accounting/period-close',
  '/settings?tab=company',
  '/settings?tab=approvals',
  '/settings?tab=roles',
  '/reports?tab=profit',
  '/reports?tab=vendors',
  '/reports?tab=occupancy',
  '/reports?tab=pdc',
  '/fixed-assets',
  '/masters',
  '/masters/serviceTypes',
  '/masters/unitsOfMeasure',
  '/masters/customerCategories',
  '/masters/vendorCategories',
  '/masters/places',
  '/masters/currencies',
  '/masters/taxCodes',
  '/masters/paymentTerms',
  '/masters/bankAccounts',
  '/masters/assetCategories',
  '/masters/reasonCodes',
  '/masters/numberSeries',
  '/masters/warehouses',
];
const customerPaths = ['/portal', '/portal/approvals', '/portal/invoices'];
const vendorPaths = ['/vendor-portal', '/vendor-portal/assignments', '/vendor-portal/bills'];

async function check(page: Page, path: string, errors: string[]) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByText('This prototype screen is being built')).toHaveCount(0);
  await expect(page.getByText('Coming in FLOW-003')).toHaveCount(0);
  await page.waitForTimeout(400); // let simulated latency settle
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => `${path}: ${v.id} → ${v.nodes[0]?.html}`)).toEqual([]);
  expect(errors, `runtime errors on ${path}`).toEqual([]);
}

for (const [persona, paths] of [
  ['Staff', staffPaths],
  ['Customer', customerPaths],
  ['Vendor', vendorPaths],
] as const) {
  test.describe(`${persona} screens`, () => {
    for (const path of paths) {
      test(path, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await signIn(page, persona);
        await check(page, path, errors);
      });
    }
  });
}
