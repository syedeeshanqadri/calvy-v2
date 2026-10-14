import Razorpay from "razorpay";

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ?? "",
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? "",
});

// The razorpay SDK ships without types for the Route (linked account) APIs,
// so we narrow to a loose surface here and keep casts in one place.
const rzp = razorpay as unknown as Record<string, any>;

export interface RouteAccountInput {
  email: string;
  phone: string;
  legalBusinessName: string;
  customerFacingName: string;
  businessType: string; // proprietorship | partnership | private_limited | ...
  category: string;
  subcategory: string;
  pan: string;
  gst?: string | null;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country?: string; // ISO-2, defaults to "IN"
  };
}

// Create a Route linked account (Accounts v2 API). Returns the acc_ id.
export async function createRouteLinkedAccount(input: RouteAccountInput): Promise<string> {
  const account = await rzp.accounts.create({
    email: input.email,
    phone: input.phone,
    type: "route",
    legal_business_name: input.legalBusinessName,
    customer_facing_business_name: input.customerFacingName,
    business_type: input.businessType,
    profile: {
      category: input.category,
      subcategory: input.subcategory,
      addresses: {
        registered: {
          street1: input.address.street,
          street2: "",
          city: input.address.city,
          state: input.address.state,
          postal_code: input.address.postalCode,
          country: input.address.country ?? "IN",
        },
      },
    },
    legal_info: {
      pan: input.pan,
      ...(input.gst ? { gst: input.gst } : {}),
    },
  });
  return account.id as string;
}

// Create the stakeholder (required for Route activation). Returns the stk_ id.
export async function createRouteStakeholder(
  accountId: string,
  input: { name: string; email: string; pan: string },
): Promise<string> {
  const stakeholder = await rzp.stakeholders.create(accountId, {
    name: input.name,
    email: input.email,
    kyc: { pan: input.pan },
  });
  return stakeholder.id as string;
}

// Request the "route" product configuration on the linked account. Returns the
// product id, needed to submit settlement (bank) details.
export async function requestRouteProduct(accountId: string): Promise<string> {
  const product = await rzp.products.requestProductConfiguration(accountId, {
    product_name: "route",
    tnc_accepted: true,
  });
  return product.id as string;
}

// Attach settlement (bank) details to the linked account's route product.
export async function configureRouteSettlement(
  accountId: string,
  productId: string,
  bank: { beneficiaryName: string; accountNumber: string; ifsc: string },
): Promise<{ status: string }> {
  const product = await rzp.products.edit(accountId, productId, {
    settlements: {
      account_number: bank.accountNumber,
      ifsc_code: bank.ifsc,
      beneficiary_name: bank.beneficiaryName,
    },
    tnc_accepted: true,
  });
  return { status: (product.activation_status as string) ?? "under_review" };
}

// Fetch the current activation status of a linked account.
export async function fetchRouteAccountStatus(accountId: string): Promise<string> {
  const account = await rzp.accounts.fetch(accountId);
  return (account.status as string) ?? "created";
}

// Split a captured payment to a linked account. amountPaise is the smallest
// currency unit (paise for INR). Idempotency must be guarded by the caller.
export async function transferPaymentToAccount(
  paymentId: string,
  accountId: string,
  amountPaise: number,
  currency: string,
): Promise<string> {
  const result = await rzp.payments.transfer(paymentId, {
    transfers: [
      {
        account: accountId,
        amount: amountPaise,
        currency: currency.toUpperCase(),
        on_hold: false,
      },
    ],
  });
  const first = Array.isArray(result?.items) ? result.items[0] : result;
  return (first?.id as string) ?? "";
}
