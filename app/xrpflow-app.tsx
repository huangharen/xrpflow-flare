"use client";

import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Network,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Wallet,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeFunctionResult,
  defineChain,
  encodeFunctionData,
  formatUnits,
  http,
  isAddress,
  keccak256,
  parseEventLogs,
  parseUnits,
  toBytes,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import { useCallback, useEffect, useMemo, useState } from "react";
import coston2Deployment from "@/deployments/coston2.json";

type EthereumProvider = {
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const COSTON2 = defineChain({
  id: 114,
  name: "Flare Testnet Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] },
  },
  blockExplorers: {
    default: {
      name: "Coston2 Explorer",
      url: "https://coston2-explorer.flare.network",
    },
  },
  testnet: true,
});

const RPC_URL = COSTON2.rpcUrls.default.http[0];
const EXPLORER_URL = COSTON2.blockExplorers.default.url;
const CONTRACT_REGISTRY =
  "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019" as Address;
const FTEST_XRP =
  "0x0b6A3645c240605887a5532109323A3E12273dc7" as Address;
const XRP_USD_FEED =
  "0x015852502f55534400000000000000000000000000" as const;
const configuredTreasuryAddress =
  process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? coston2Deployment.address;
const TREASURY_ADDRESS = isAddress(configuredTreasuryAddress)
  ? (configuredTreasuryAddress as Address)
  : undefined;
const configuredDeployBlock =
  process.env.NEXT_PUBLIC_TREASURY_DEPLOY_BLOCK ??
  String(coston2Deployment.deploymentBlock);
const TREASURY_DEPLOY_BLOCK = /^\d+$/.test(configuredDeployBlock)
  ? BigInt(configuredDeployBlock)
  : 0n;
const CONTRACT_CONFIGURED = Boolean(
  TREASURY_ADDRESS &&
    TREASURY_ADDRESS.toLowerCase() !== zeroAddress &&
    TREASURY_DEPLOY_BLOCK > 0n,
);

const registryAbi = [
  {
    type: "function",
    name: "getContractAddressByName",
    stateMutability: "view",
    inputs: [{ name: "_name", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const ftsoAbi = [
  {
    type: "function",
    name: "getFeedByIdInWei",
    stateMutability: "payable",
    inputs: [{ name: "_feedId", type: "bytes21" }],
    outputs: [
      { name: "_value", type: "uint256" },
      { name: "_timestamp", type: "uint64" },
    ],
  },
] as const;

const tokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const treasuryAbi = [
  {
    type: "function",
    name: "paymentToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "ftsoV2",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "createPayment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "usdAmount6", type: "uint256" },
      { name: "maxFxrpAmount6", type: "uint256" },
      { name: "dueAt", type: "uint64" },
      { name: "expiresAt", type: "uint64" },
      { name: "referenceHash", type: "bytes32" },
    ],
    outputs: [{ name: "paymentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "executePayment",
    stateMutability: "payable",
    inputs: [{ name: "paymentId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelPayment",
    stateMutability: "nonpayable",
    inputs: [{ name: "paymentId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "topUp",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentId", type: "uint256" },
      { name: "additionalFxrp6", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refundExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "paymentId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getPayment",
    stateMutability: "view",
    inputs: [{ name: "paymentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "payer", type: "address" },
          { name: "recipient", type: "address" },
          { name: "usdAmount6", type: "uint128" },
          { name: "escrowedFxrp6", type: "uint128" },
          { name: "dueAt", type: "uint64" },
          { name: "expiresAt", type: "uint64" },
          { name: "status", type: "uint8" },
          { name: "referenceHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "PaymentCreated",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "usdAmount6", type: "uint256", indexed: false },
      { name: "escrowedFxrp6", type: "uint256", indexed: false },
      { name: "dueAt", type: "uint64", indexed: false },
      { name: "expiresAt", type: "uint64", indexed: false },
      { name: "referenceHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PaymentToppedUp",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newEscrowedFxrp6", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PaymentPaid",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "paidFxrp6", type: "uint256", indexed: false },
      { name: "refundedFxrp6", type: "uint256", indexed: false },
      { name: "xrpUsdPriceWad", type: "uint256", indexed: false },
      { name: "oracleTimestamp", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PaymentCancelled",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "refundedFxrp6", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PaymentRefunded",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "refundedFxrp6", type: "uint256", indexed: false },
    ],
  },
] as const;

const publicClient = createPublicClient({
  chain: COSTON2,
  transport: http(RPC_URL),
});

async function waitForSuccessfulReceipt(hash: Hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("The transaction was mined but reverted. No state change was recorded.");
  }
  return receipt;
}

function reserveForUsd(usdAmount6: bigint, priceWad: bigint) {
  const requiredFxrp6 = (usdAmount6 * 10n ** 18n + priceWad - 1n) / priceWad;
  return (requiredFxrp6 * 105n + 99n) / 100n;
}

type ViewName = "overview" | "payments" | "activity" | "settings";
type PaymentStatus = "scheduled" | "ready" | "expired" | "paid" | "cancelled" | "refunded";

type Payment = {
  id: string;
  recipient: string;
  address: Address;
  usdAmount: number;
  fxrpReserved: number;
  dueAt: string;
  status: PaymentStatus;
  reference: string;
  transaction: Hash | `demo-${string}`;
  createdAt: string;
  expiresAt?: string;
  payer?: Address;
};

type ActivityItem = {
  id: string;
  event: string;
  account: string;
  amount: string;
  timestamp: string;
  transaction: string;
};

const DEMO_EPOCH = Date.UTC(2026, 6, 12, 13);
const demoTime = (offsetHours: number) =>
  new Date(DEMO_EPOCH + offsetHours * 3_600_000).toISOString();

const DEMO_PAYMENTS: Payment[] = [
  {
    id: "1048",
    recipient: "Kenji Sato",
    address: "0x7e71c8d5b4b8b7ea59ddd03f9cb6cec4a468f49a",
    usdAmount: 250,
    fxrpReserved: 122.94,
    dueAt: demoTime(48),
    status: "scheduled",
    reference: "July contributor payout",
    transaction: "demo-scheduled-1048",
    createdAt: demoTime(-26),
  },
  {
    id: "1047",
    recipient: "Aiko Tanaka",
    address: "0x24af9eeb184c0f3a89e6db970363188c86b59a71",
    usdAmount: 420,
    fxrpReserved: 206.54,
    dueAt: demoTime(-2),
    status: "ready",
    reference: "Product design milestone",
    transaction: "demo-ready-1047",
    createdAt: demoTime(-72),
  },
  {
    id: "1046",
    recipient: "Tokyo Studio",
    address: "0xd3b01d3accc67084294e0159aba4bd9198d6936f",
    usdAmount: 720,
    fxrpReserved: 351.82,
    dueAt: demoTime(-96),
    status: "paid",
    reference: "Prototype delivery",
    transaction: "demo-paid-1046",
    createdAt: demoTime(-144),
  },
  {
    id: "1045",
    recipient: "Research Partner",
    address: "0xb075ec065a7318f3c234671aaeaa78b2b27e5bd2",
    usdAmount: 180,
    fxrpReserved: 88.12,
    dueAt: demoTime(24),
    status: "cancelled",
    reference: "Data review",
    transaction: "demo-cancelled-1045",
    createdAt: demoTime(-50),
  },
];

const DEMO_ACTIVITY: ActivityItem[] = [
  {
    id: "a1",
    event: "Payment scheduled",
    account: "Kenji Sato",
    amount: "$250.00",
    timestamp: DEMO_PAYMENTS[0].createdAt,
    transaction: DEMO_PAYMENTS[0].transaction,
  },
  {
    id: "a2",
    event: "Payment scheduled",
    account: "Aiko Tanaka",
    amount: "$420.00",
    timestamp: DEMO_PAYMENTS[1].createdAt,
    transaction: DEMO_PAYMENTS[1].transaction,
  },
  {
    id: "a3",
    event: "Payment claimed",
    account: "Tokyo Studio",
    amount: "$720.00",
    timestamp: demoTime(-95),
    transaction: DEMO_PAYMENTS[2].transaction,
  },
  {
    id: "a4",
    event: "Payment cancelled",
    account: "Research Partner",
    amount: "$180.00",
    timestamp: demoTime(-48),
    transaction: DEMO_PAYMENTS[3].transaction,
  },
];

function rollingDemoData(epoch: number) {
  const at = (offsetHours: number) =>
    new Date(epoch + offsetHours * 3_600_000).toISOString();
  const payments = DEMO_PAYMENTS.map((payment, index) => {
    const dueOffsets = [48, -2, -96, 24];
    const createdOffsets = [-26, -72, -144, -50];
    return {
      ...payment,
      dueAt: at(dueOffsets[index]),
      createdAt: at(createdOffsets[index]),
    };
  });
  const activity = DEMO_ACTIVITY.map((item, index) => ({
    ...item,
    timestamp:
      index === 0
        ? payments[0].createdAt
        : index === 1
          ? payments[1].createdAt
          : index === 2
            ? at(-95)
            : at(-48),
  }));
  return { payments, activity };
}

const navItems: { id: ViewName; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "activity", label: "Activity", icon: ActivityIcon },
  { id: "settings", label: "Settings", icon: Settings },
];

const viewTitles: Record<ViewName, { title: string; description: string }> = {
  overview: {
    title: "Treasury",
    description: "Monitor available funds, scheduled payments, and settlement activity.",
  },
  payments: {
    title: "Payments",
    description: "Review payment instructions and their onchain settlement status.",
  },
  activity: {
    title: "Activity",
    description: "A chronological record of treasury events on Coston2.",
  },
  settings: {
    title: "Settings",
    description: "Network, contract, oracle, and reserve configuration.",
  },
};

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function formatFxrpAmount(value: bigint) {
  return `${Number(formatUnits(value, 6)).toLocaleString("en-US", { maximumFractionDigits: 6 })} FTestXRP`;
}

function shortAddress(value: string, start = 6, end = 4) {
  if (value.startsWith("demo-")) return "Demo transaction";
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function formatDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: includeTime ? undefined : "numeric",
    hour: includeTime ? "numeric" : undefined,
    minute: includeTime ? "2-digit" : undefined,
  }).format(new Date(value));
}

function defaultDueAt() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${part(date.getUTCMonth() + 1)}-${part(date.getUTCDate())}T${part(date.getUTCHours())}:${part(date.getUTCMinutes())}`;
}

function parseDueAt(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? Date.parse(`${value}:00Z`) : Number.NaN;
}

function statusFromChain(
  status: number,
  dueAt: number,
  expiresAt: number,
  now = Math.floor(Date.now() / 1000),
): PaymentStatus {
  if (status === 2) return "paid";
  if (status === 3) return "cancelled";
  if (status === 4) return "refunded";
  if (now > expiresAt) return "expired";
  if (now >= dueAt) return "ready";
  return "scheduled";
}

function statusLabel(status: PaymentStatus) {
  return {
    scheduled: "Scheduled",
    ready: "Ready to claim",
    expired: "Expired",
    paid: "Paid",
    cancelled: "Cancelled",
    refunded: "Refunded",
  }[status];
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const Icon =
    status === "paid"
      ? CheckCircle2
      : status === "cancelled" || status === "refunded"
        ? XCircle
        : status === "ready"
          ? CircleDollarSign
          : Clock3;
  return (
    <span className={`status-badge status-${status}`}>
      <Icon size={13} aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button className="icon-button" type="button" aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function XRPFlowApp() {
  const [activeView, setActiveView] = useState<ViewName>("overview");
  const [demoPayments, setDemoPayments] = useState<Payment[]>(DEMO_PAYMENTS);
  const [demoActivity, setDemoActivity] = useState<ActivityItem[]>(DEMO_ACTIVITY);
  const [chainPayments, setChainPayments] = useState<Payment[]>([]);
  const [chainActivity, setChainActivity] = useState<ActivityItem[]>([]);
  const [chainState, setChainState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [statusNow, setStatusNow] = useState(() => Math.floor(Date.now() / 1000));
  const [chainError, setChainError] = useState("");
  const [contractState, setContractState] = useState<
    "unconfigured" | "checking" | "valid" | "invalid"
  >(CONTRACT_CONFIGURED ? "checking" : "unconfigured");
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletPending, setWalletPending] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState<"edit" | "review" | "success">("edit");
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PaymentStatus>("all");
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const [oraclePrice, setOraclePrice] = useState(2.1342);
  const [oraclePriceWad, setOraclePriceWad] = useState<bigint | null>(null);
  const [oracleAge, setOracleAge] = useState<number | null>(null);
  const [oracleState, setOracleState] = useState<"loading" | "live" | "fallback" | "stale">(
    "loading",
  );
  const [oracleAddress, setOracleAddress] = useState<Address | null>(null);
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionError, setTransactionError] = useState("");
  const [resultTx, setResultTx] = useState<Hash | `demo-${string}` | null>(null);
  const [lastCreatedPayment, setLastCreatedPayment] = useState<Payment | null>(null);
  const [walletBalanceFxrp, setWalletBalanceFxrp] = useState<{
    address: Address;
    amount: number;
  } | null>(null);
  const [form, setForm] = useState({
    recipient: "0x7e71c8d5b4b8b7ea59ddd03f9cb6cec4a468f49a",
    label: "Kenji Sato",
    amount: "250.00",
    dueAt: "",
    reference: "July contributor payout",
  });

  const connected = walletAddress !== null;
  const correctNetwork = chainId === COSTON2.id;
  const contractConfigured = CONTRACT_CONFIGURED;
  const isLiveContract = contractConfigured && contractState === "valid";
  const liveMode = Boolean(connected && correctNetwork && isLiveContract);
  const verifiedWalletBalanceFxrp =
    walletAddress &&
    walletBalanceFxrp?.address.toLowerCase() === walletAddress.toLowerCase()
      ? walletBalanceFxrp.amount
      : null;
  const currentChainPayments = useMemo(
    () =>
      chainPayments.map((payment) => {
        if (
          (payment.status !== "scheduled" && payment.status !== "ready" && payment.status !== "expired") ||
          !payment.expiresAt
        ) {
          return payment;
        }
        const status = statusFromChain(
          1,
          Math.floor(Date.parse(payment.dueAt) / 1000),
          Math.floor(Date.parse(payment.expiresAt) / 1000),
          statusNow,
        );
        return status === payment.status ? payment : { ...payment, status };
      }),
    [chainPayments, statusNow],
  );
  const payments = liveMode ? currentChainPayments : demoPayments;
  const activity = liveMode ? chainActivity : demoActivity;

  const refreshOracle = useCallback(async () => {
    setOracleState("loading");
    try {
      const ftsoAddress = await publicClient.readContract({
        address: CONTRACT_REGISTRY,
        abi: registryAbi,
        functionName: "getContractAddressByName",
        args: ["FtsoV2"],
      });
      const data = encodeFunctionData({
        abi: ftsoAbi,
        functionName: "getFeedByIdInWei",
        args: [XRP_USD_FEED],
      });
      const response = await publicClient.call({ to: ftsoAddress, data });
      if (!response.data) throw new Error("The oracle returned no data.");
      const [priceWad, timestamp] = decodeFunctionResult({
        abi: ftsoAbi,
        functionName: "getFeedByIdInWei",
        data: response.data,
      });
      const price = Number(formatUnits(priceWad, 18));
      const observedAt = Number(timestamp);
      if (!Number.isFinite(price) || price <= 0 || observedAt <= 0) {
        throw new Error("The oracle returned an invalid quote.");
      }
      const now = Math.floor(Date.now() / 1000);
      if (observedAt > now) {
        throw new Error("The oracle returned a future timestamp.");
      }
      const age = now - observedAt;
      setOraclePrice(price);
      setOraclePriceWad(priceWad);
      setOracleAge(age);
      setOracleAddress(ftsoAddress);
      setOracleState(age > 300 ? "stale" : "live");
    } catch {
      setOracleAge(null);
      setOraclePriceWad(null);
      setOracleState("fallback");
    }
  }, []);

  const verifyContract = useCallback(async () => {
    if (!TREASURY_ADDRESS || !contractConfigured) {
      setContractState("unconfigured");
      return;
    }
    setContractState("checking");
    try {
      const [code, paymentToken, ftsoAddress] = await Promise.all([
        publicClient.getCode({ address: TREASURY_ADDRESS }),
        publicClient.readContract({
          address: TREASURY_ADDRESS,
          abi: treasuryAbi,
          functionName: "paymentToken",
        }),
        publicClient.readContract({
          address: TREASURY_ADDRESS,
          abi: treasuryAbi,
          functionName: "ftsoV2",
        }),
      ]);
      const ftsoCode = await publicClient.getCode({ address: ftsoAddress });
      if (
        !code ||
        code === "0x" ||
        paymentToken.toLowerCase() !== FTEST_XRP.toLowerCase() ||
        ftsoAddress.toLowerCase() === zeroAddress ||
        !ftsoCode ||
        ftsoCode === "0x"
      ) {
        throw new Error("The configured address is not a compatible XRPFlow escrow.");
      }
      setContractState("valid");
    } catch {
      setContractState("invalid");
    }
  }, [contractConfigured]);

  useEffect(() => {
    const timer = window.setTimeout(verifyContract, 0);
    return () => window.clearTimeout(timer);
  }, [verifyContract]);

  useEffect(() => {
    const initial = window.setTimeout(refreshOracle, 0);
    const interval = window.setInterval(refreshOracle, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refreshOracle]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const rolled = rollingDemoData(Math.floor(Date.now() / 3_600_000) * 3_600_000);
      setDemoPayments(rolled.payments);
      setDemoActivity(rolled.activity);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(
      () => setStatusNow(Math.floor(Date.now() / 1000)),
      30_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;

    const syncAccounts = async () => {
      try {
        const accounts = (await provider.request({ method: "eth_accounts" })) as Address[];
        const rawChainId = (await provider.request({ method: "eth_chainId" })) as string;
        setWalletAddress(accounts[0] ?? null);
        setChainId(Number.parseInt(rawChainId, 16));
      } catch {
        setWalletAddress(null);
      }
    };

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as Address[];
      setWalletAddress(accounts?.[0] ?? null);
    };
    const onChainChanged = (...args: unknown[]) => {
      setChainId(Number.parseInt(args[0] as string, 16));
    };

    syncAccounts();
    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  const refreshWalletBalance = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const balance = await publicClient.readContract({
        address: FTEST_XRP,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [walletAddress],
      });
      setWalletBalanceFxrp({
        address: walletAddress,
        amount: Number(formatUnits(balance, 6)),
      });
    } catch {
      setWalletBalanceFxrp(null);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) return;
    const initial = window.setTimeout(refreshWalletBalance, 0);
    const interval = window.setInterval(refreshWalletBalance, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [walletAddress, refreshWalletBalance]);

  const loadChainData = useCallback(async () => {
    if (!TREASURY_ADDRESS || !isLiveContract || !walletAddress) return;
    setChainState("loading");
    setChainError("");
    try {
      const creationLogs = await publicClient.getContractEvents({
        address: TREASURY_ADDRESS,
        abi: treasuryAbi,
        eventName: "PaymentCreated",
        args: { payer: walletAddress },
        fromBlock: TREASURY_DEPLOY_BLOCK,
        toBlock: "latest",
      });

      const records = await Promise.all(
        creationLogs.map(async (event) => {
          const paymentId = event.args.paymentId;
          const createdEscrow = event.args.escrowedFxrp6;
          if (
            paymentId === undefined ||
            createdEscrow === undefined ||
            !event.transactionHash ||
            event.blockNumber === null
          ) {
            throw new Error("A PaymentCreated event was missing required chain metadata.");
          }
          const [payment, block] = await Promise.all([
            publicClient.readContract({
              address: TREASURY_ADDRESS,
              abi: treasuryAbi,
              functionName: "getPayment",
              args: [paymentId],
            }),
            publicClient.getBlock({ blockNumber: event.blockNumber }),
          ]);
          const dueAt = Number(payment.dueAt);
          const expiresAt = Number(payment.expiresAt);
          return {
            id: paymentId.toString(),
            recipient: shortAddress(payment.recipient),
            address: payment.recipient,
            payer: payment.payer,
            usdAmount: Number(formatUnits(payment.usdAmount6, 6)),
            fxrpReserved: Number(
              formatUnits(
                payment.escrowedFxrp6 === 0n ? createdEscrow : payment.escrowedFxrp6,
                6,
              ),
            ),
            dueAt: new Date(dueAt * 1000).toISOString(),
            expiresAt: new Date(expiresAt * 1000).toISOString(),
            status: statusFromChain(Number(payment.status), dueAt, expiresAt),
            reference: `Onchain reference ${shortAddress(payment.referenceHash, 10, 8)}`,
            transaction: event.transactionHash,
            createdAt: new Date(Number(block.timestamp) * 1000).toISOString(),
          } satisfies Payment;
        }),
      );

      records.sort((left, right) => Number(right.id) - Number(left.id));
      const recordsById = new Map(records.map((payment) => [payment.id, payment]));
      const [topUpLogs, paidLogs, cancelledLogs, refundedLogs] = await Promise.all([
        publicClient.getContractEvents({
          address: TREASURY_ADDRESS,
          abi: treasuryAbi,
          eventName: "PaymentToppedUp",
          fromBlock: TREASURY_DEPLOY_BLOCK,
          toBlock: "latest",
        }),
        publicClient.getContractEvents({
          address: TREASURY_ADDRESS,
          abi: treasuryAbi,
          eventName: "PaymentPaid",
          fromBlock: TREASURY_DEPLOY_BLOCK,
          toBlock: "latest",
        }),
        publicClient.getContractEvents({
          address: TREASURY_ADDRESS,
          abi: treasuryAbi,
          eventName: "PaymentCancelled",
          fromBlock: TREASURY_DEPLOY_BLOCK,
          toBlock: "latest",
        }),
        publicClient.getContractEvents({
          address: TREASURY_ADDRESS,
          abi: treasuryAbi,
          eventName: "PaymentRefunded",
          fromBlock: TREASURY_DEPLOY_BLOCK,
          toBlock: "latest",
        }),
      ]);
      for (const event of topUpLogs) {
        const paymentId = event.args.paymentId;
        const amount = event.args.amount;
        const payment = paymentId === undefined ? undefined : recordsById.get(paymentId.toString());
        if (
          payment &&
          amount !== undefined &&
          (payment.status === "paid" || payment.status === "cancelled" || payment.status === "refunded")
        ) {
          payment.fxrpReserved += Number(formatUnits(amount, 6));
        }
      }
      const blockTimes = new Map<bigint, Promise<string>>();
      const eventTime = (blockNumber: bigint | null) => {
        if (blockNumber === null) {
          return Promise.reject(new Error("A contract event was missing its block number."));
        }
        let pending = blockTimes.get(blockNumber);
        if (!pending) {
          pending = publicClient
            .getBlock({ blockNumber })
            .then((block) => new Date(Number(block.timestamp) * 1000).toISOString());
          blockTimes.set(blockNumber, pending);
        }
        return pending;
      };
      const topUpActivity = await Promise.all(
        topUpLogs.map(async (event) => {
          const paymentId = event.args.paymentId;
          const amount = event.args.amount;
          const payment = paymentId === undefined ? undefined : recordsById.get(paymentId.toString());
          if (!payment || amount === undefined || !event.transactionHash) return null;
          return {
            id: `chain-topup-${event.transactionHash}`,
            event: "Reserve added",
            account: payment.payer ? shortAddress(payment.payer) : payment.recipient,
            amount: formatFxrpAmount(amount),
            timestamp: await eventTime(event.blockNumber),
            transaction: event.transactionHash,
          } satisfies ActivityItem;
        }),
      );
      const paidActivity = await Promise.all(
        paidLogs.map(async (event) => {
          const paymentId = event.args.paymentId;
          const paidAmount = event.args.paidFxrp6;
          const payment = paymentId === undefined ? undefined : recordsById.get(paymentId.toString());
          if (!payment || paidAmount === undefined || !event.transactionHash) return null;
          return {
            id: `chain-paid-${event.transactionHash}`,
            event: "Payment paid",
            account: payment.recipient,
            amount: formatFxrpAmount(paidAmount),
            timestamp: await eventTime(event.blockNumber),
            transaction: event.transactionHash,
          } satisfies ActivityItem;
        }),
      );
      const cancelledActivity = await Promise.all(
        cancelledLogs.map(async (event) => {
          const paymentId = event.args.paymentId;
          const refund = event.args.refundedFxrp6;
          const payment = paymentId === undefined ? undefined : recordsById.get(paymentId.toString());
          if (!payment || refund === undefined || !event.transactionHash) return null;
          return {
            id: `chain-cancelled-${event.transactionHash}`,
            event: "Payment cancelled",
            account: payment.payer ? shortAddress(payment.payer) : payment.recipient,
            amount: formatFxrpAmount(refund),
            timestamp: await eventTime(event.blockNumber),
            transaction: event.transactionHash,
          } satisfies ActivityItem;
        }),
      );
      const refundedActivity = await Promise.all(
        refundedLogs.map(async (event) => {
          const paymentId = event.args.paymentId;
          const refund = event.args.refundedFxrp6;
          const payment = paymentId === undefined ? undefined : recordsById.get(paymentId.toString());
          if (!payment || refund === undefined || !event.transactionHash) return null;
          return {
            id: `chain-refunded-${event.transactionHash}`,
            event: "Payment refunded",
            account: payment.payer ? shortAddress(payment.payer) : payment.recipient,
            amount: formatFxrpAmount(refund),
            timestamp: await eventTime(event.blockNumber),
            transaction: event.transactionHash,
          } satisfies ActivityItem;
        }),
      );
      const eventActivity: ActivityItem[] = [
        ...records.map((payment) => ({
          id: `chain-created-${payment.id}`,
          event: "Payment created",
          account: payment.recipient,
          amount: usdFormatter.format(payment.usdAmount),
          timestamp: payment.createdAt,
          transaction: payment.transaction,
        })),
        ...topUpActivity,
        ...paidActivity,
        ...cancelledActivity,
        ...refundedActivity,
      ]
        .filter((item) => item !== null)
        .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
      setChainPayments(records);
      setChainActivity(eventActivity);
      setChainState("ready");
    } catch {
      setChainPayments([]);
      setChainActivity([]);
      setChainState("error");
      setChainError(
        "Onchain records could not be loaded. Check the treasury address and deployment block, then retry.",
      );
    }
  }, [isLiveContract, walletAddress]);

  useEffect(() => {
    if (!liveMode) return;
    const initial = window.setTimeout(loadChainData, 0);
    const interval = window.setInterval(loadChainData, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [liveMode, loadChainData]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const showToast = (message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone });
  };

  const connectWallet = async () => {
    setWalletError("");
    if (!window.ethereum) {
      setWalletError("No compatible wallet was found. Install MetaMask or use the demo workspace.");
      return;
    }
    setWalletPending(true);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as Address[];
      const rawChainId = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      setWalletAddress(accounts[0] ?? null);
      setChainId(Number.parseInt(rawChainId, 16));
    } catch {
      setWalletError("Wallet connection was declined. No account data was shared.");
    } finally {
      setWalletPending(false);
    }
  };

  const switchNetwork = async () => {
    if (!window.ethereum) return;
    setWalletError("");
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x72" }],
      });
      setChainId(COSTON2.id);
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x72",
                chainName: COSTON2.name,
                nativeCurrency: COSTON2.nativeCurrency,
                rpcUrls: [RPC_URL],
                blockExplorerUrls: [EXPLORER_URL],
              },
            ],
          });
          setChainId(COSTON2.id);
          return;
        } catch {
          // The actionable message below covers both rejection and provider errors.
        }
      }
      setWalletError("Coston2 was not added. Open your wallet network settings and try again.");
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied`);
    } catch {
      showToast("Copy failed. Select the value manually.", "error");
    }
  };

  const resetForm = () => {
    setForm({
      recipient: "0x7e71c8d5b4b8b7ea59ddd03f9cb6cec4a468f49a",
      label: "Kenji Sato",
      amount: "250.00",
      dueAt: defaultDueAt(),
      reference: "July contributor payout",
    });
    setDrawerStep("edit");
    setTransactionError("");
    setResultTx(null);
  };

  const openNewPayment = () => {
    if (connected && contractConfigured && contractState !== "valid") {
      setWalletError(
        contractState === "checking"
          ? "Wait for treasury contract verification to finish."
          : "The configured treasury contract failed verification. Check the address and deployment block.",
      );
      return;
    }
    if (connected && isLiveContract && !correctNetwork) {
      setWalletError("Switch to Coston2 before creating a contract payment.");
      return;
    }
    resetForm();
    setDrawerOpen(true);
  };

  const amountText = form.amount.trim();
  const amountFormatValid = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amountText);
  const amountUsd = amountFormatValid ? Number(amountText) : 0;
  const amountValid =
    amountFormatValid && Number.isFinite(amountUsd) && amountUsd >= 0.01 && amountUsd <= 10_000_000;
  const estimatedFxrp = oraclePrice > 0 ? amountUsd / oraclePrice : 0;
  const liveReserveAmount6 =
    liveMode && amountValid && oraclePriceWad !== null
      ? reserveForUsd(parseUnits(amountText, 6), oraclePriceWad)
      : null;
  const reserveFxrp =
    liveReserveAmount6 === null
      ? estimatedFxrp * 1.05
      : Number(formatUnits(liveReserveAmount6, 6));

  const reviewPayment = () => {
    setTransactionError("");
    if (!isAddress(form.recipient) || form.recipient.toLowerCase() === zeroAddress) {
      setTransactionError("Enter a valid EVM recipient address.");
      return;
    }
    if (!amountFormatValid) {
      setTransactionError("Enter a USD amount with no more than two decimal places.");
      return;
    }
    if (!amountValid) {
      setTransactionError("Enter an amount from $0.01 to $10,000,000.00.");
      return;
    }
    const dueTime = parseDueAt(form.dueAt);
    if (!form.dueAt || !Number.isFinite(dueTime) || dueTime <= Date.now()) {
      setTransactionError("Choose a due date in the future.");
      return;
    }
    if (
      liveMode &&
      (oracleState !== "live" || oraclePriceWad === null || oracleAge === null || oracleAge > 300)
    ) {
      setTransactionError("A fresh live FTSO quote is required for a contract payment.");
      return;
    }
    if (liveMode) {
      if (verifiedWalletBalanceFxrp === null) {
        setTransactionError("The FTestXRP wallet balance could not be verified. Reconnect and try again.");
        return;
      }
      if (verifiedWalletBalanceFxrp < reserveFxrp) {
        setTransactionError("The wallet does not have enough FTestXRP for this reserve. Get test assets first.");
        return;
      }
    }
    setDrawerStep("review");
  };

  const persistPayment = (
    transaction: Hash | `demo-${string}`,
    target: "demo" | "chain",
    chainPaymentId?: bigint,
  ) => {
    const dueAt = new Date(parseDueAt(form.dueAt));
    const payment: Payment = {
      id:
        target === "chain" && chainPaymentId !== undefined
          ? chainPaymentId.toString()
          : String(1049 + demoPayments.filter((item) => item.id.startsWith("10")).length),
      recipient: form.label.trim() || shortAddress(form.recipient),
      address: form.recipient as Address,
      payer: target === "chain" ? walletAddress ?? undefined : undefined,
      usdAmount: amountUsd,
      fxrpReserved: reserveFxrp,
      dueAt: dueAt.toISOString(),
      expiresAt: new Date(dueAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: "scheduled",
      reference: form.reference.trim() || "Unspecified payment",
      transaction,
      createdAt: new Date().toISOString(),
    };
    const setWorkspacePayments = target === "chain" ? setChainPayments : setDemoPayments;
    const setWorkspaceActivity = target === "chain" ? setChainActivity : setDemoActivity;
    setWorkspacePayments((current) => [payment, ...current.filter((item) => item.id !== payment.id)]);
    setLastCreatedPayment(payment);
    setWorkspaceActivity((current) => [
      {
        id: `activity-${Date.now()}`,
        event: target === "chain" ? "Payment created" : "Payment scheduled",
        account: payment.recipient,
        amount: usdFormatter.format(payment.usdAmount),
        timestamp: payment.createdAt,
        transaction,
      },
      ...current,
    ]);
  };

  const schedulePayment = async () => {
    setTransactionPending(true);
    setTransactionError("");
    try {
      const dueAtMs = parseDueAt(form.dueAt);
      if (
        !isAddress(form.recipient) ||
        form.recipient.toLowerCase() === zeroAddress ||
        !amountValid ||
        !Number.isFinite(dueAtMs) ||
        dueAtMs <= Date.now()
      ) {
        throw new Error("The payment details changed. Review the amount and due date again.");
      }
      if (connected && contractConfigured && contractState !== "valid") {
        throw new Error("The configured treasury contract has not passed verification.");
      }
      if (connected && isLiveContract && !correctNetwork) {
        throw new Error("Switch to Coston2 before scheduling this contract payment.");
      }

      if (liveMode && window.ethereum && TREASURY_ADDRESS && walletAddress) {
        if (
          oracleState !== "live" ||
          oraclePriceWad === null ||
          oracleAge === null ||
          oracleAge > 300
        ) {
          throw new Error("Refresh the live FTSO quote before scheduling this contract payment.");
        }
        const walletClient = createWalletClient({
          account: walletAddress,
          chain: COSTON2,
          transport: custom(window.ethereum),
        });
        const usdAmount6 = parseUnits(amountText, 6);
        const reserveAmount = reserveForUsd(usdAmount6, oraclePriceWad);
        const approvalTx = await walletClient.writeContract({
          address: FTEST_XRP,
          abi: tokenAbi,
          functionName: "approve",
          args: [TREASURY_ADDRESS, reserveAmount],
        });
        await waitForSuccessfulReceipt(approvalTx);

        const dueAt = BigInt(Math.floor(dueAtMs / 1000));
        const expiresAt = dueAt + 30n * 24n * 60n * 60n;
        const transaction = await walletClient.writeContract({
          address: TREASURY_ADDRESS,
          abi: treasuryAbi,
          functionName: "createPayment",
          args: [
            form.recipient as Address,
            usdAmount6,
            reserveAmount,
            dueAt,
            expiresAt,
            keccak256(toBytes(form.reference || form.label || form.recipient)),
          ],
        });
        const receipt = await waitForSuccessfulReceipt(transaction);
        const [createdEvent] = parseEventLogs({
          abi: treasuryAbi,
          logs: receipt.logs,
          eventName: "PaymentCreated",
          strict: true,
        });
        if (!createdEvent || createdEvent.args.paymentId === undefined) {
          throw new Error("The contract transaction succeeded without a PaymentCreated event.");
        }
        setResultTx(transaction);
        persistPayment(transaction, "chain", createdEvent.args.paymentId);
        await refreshWalletBalance();
      } else {
        const transaction = `demo-${Date.now()}` as const;
        setResultTx(transaction);
        persistPayment(transaction, "demo");
      }
      setDrawerStep("success");
    } catch (error) {
      const message = (error as { shortMessage?: string; message?: string }).shortMessage;
      setTransactionError(
        message?.includes("User rejected")
          ? "The transaction was rejected in your wallet. No funds were moved."
          : message ||
              (error as { message?: string }).message ||
              "The transaction failed. Review your wallet and try again.",
      );
    } finally {
      setTransactionPending(false);
    }
  };

  const handlePaymentAction = async (
    payment: Payment,
    action: "cancel" | "claim" | "refund",
  ) => {
    const nextStatus: PaymentStatus =
      action === "claim" ? "paid" : action === "refund" ? "refunded" : "cancelled";
    const event =
      action === "claim" ? "Payment claimed" : action === "refund" ? "Payment refunded" : "Payment cancelled";

    if (payment.transaction.startsWith("demo-")) {
      setDemoPayments((current) =>
        current.map((item) => (item.id === payment.id ? { ...item, status: nextStatus } : item)),
      );
      setSelectedPayment((current) => (current ? { ...current, status: nextStatus } : current));
      setDemoActivity((current) => [
        {
          id: `activity-${Date.now()}`,
          event,
          account: payment.recipient,
          amount: usdFormatter.format(payment.usdAmount),
          timestamp: new Date().toISOString(),
          transaction: payment.transaction,
        },
        ...current,
      ]);
      showToast(event);
      return;
    }

    if (!liveMode || !window.ethereum || !TREASURY_ADDRESS || !walletAddress) {
      showToast("Connect a Coston2 wallet before submitting this contract action.", "error");
      return;
    }

    setTransactionPending(true);
    try {
      const walletClient = createWalletClient({
        account: walletAddress,
        chain: COSTON2,
        transport: custom(window.ethereum),
      });
      const functionName =
        action === "claim" ? "executePayment" : action === "refund" ? "refundExpired" : "cancelPayment";
      const transaction = await walletClient.writeContract({
        address: TREASURY_ADDRESS,
        abi: treasuryAbi,
        functionName,
        args: [BigInt(payment.id)],
      });
      await waitForSuccessfulReceipt(transaction);
      await Promise.all([loadChainData(), refreshWalletBalance()]);
      setSelectedPayment(null);
      showToast(event);
    } catch (error) {
      const message = (error as { shortMessage?: string }).shortMessage;
      showToast(
        message?.includes("User rejected")
          ? "The wallet request was rejected. No funds were moved."
          : message || "The contract action failed without changing the payment.",
        "error",
      );
    } finally {
      setTransactionPending(false);
    }
  };

  const handleTopUp = async (payment: Payment, value: string) => {
    const amount = value.trim();
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount)) {
      showToast("Enter a FTestXRP amount with no more than six decimal places.", "error");
      return;
    }
    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0 || amountNumber > 10_000_000) {
      showToast("Enter a top-up amount from 0.000001 to 10,000,000 FTestXRP.", "error");
      return;
    }
    if (
      !liveMode ||
      !window.ethereum ||
      !TREASURY_ADDRESS ||
      !walletAddress ||
      !payment.payer ||
      payment.payer.toLowerCase() !== walletAddress.toLowerCase()
    ) {
      showToast("Only the payer can add reserve from a connected Coston2 wallet.", "error");
      return;
    }
    if (verifiedWalletBalanceFxrp === null || verifiedWalletBalanceFxrp < amountNumber) {
      showToast("The wallet does not have enough FTestXRP for this top-up.", "error");
      return;
    }

    setTransactionPending(true);
    try {
      const walletClient = createWalletClient({
        account: walletAddress,
        chain: COSTON2,
        transport: custom(window.ethereum),
      });
      const additionalFxrp6 = parseUnits(amount, 6);
      const approval = await walletClient.writeContract({
        address: FTEST_XRP,
        abi: tokenAbi,
        functionName: "approve",
        args: [TREASURY_ADDRESS, additionalFxrp6],
      });
      await waitForSuccessfulReceipt(approval);
      const transaction = await walletClient.writeContract({
        address: TREASURY_ADDRESS,
        abi: treasuryAbi,
        functionName: "topUp",
        args: [BigInt(payment.id), additionalFxrp6],
      });
      await waitForSuccessfulReceipt(transaction);
      await Promise.all([loadChainData(), refreshWalletBalance()]);
      setSelectedPayment(null);
      showToast("Reserve added");
    } catch (error) {
      const message = (error as { shortMessage?: string }).shortMessage;
      showToast(
        message?.includes("User rejected")
          ? "The wallet request was rejected. No reserve was added."
          : message || "The reserve top-up failed without changing the payment.",
        "error",
      );
    } finally {
      setTransactionPending(false);
    }
  };

  const filteredPayments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payments.filter((payment) => {
      const matchesStatus = statusFilter === "all" || payment.status === statusFilter;
      const matchesSearch =
        !term ||
        payment.recipient.toLowerCase().includes(term) ||
        payment.address.toLowerCase().includes(term) ||
        payment.reference.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [payments, search, statusFilter]);

  const reservedTotal = payments
    .filter(
      (payment) =>
        payment.status === "scheduled" || payment.status === "ready" || payment.status === "expired",
    )
    .reduce((sum, payment) => sum + payment.fxrpReserved, 0);
  const paidThisMonth = payments
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + payment.usdAmount, 0);
  const readyCount = payments.filter((payment) => payment.status === "ready").length;
  const balanceIsLive = Boolean(
    liveMode && verifiedWalletBalanceFxrp !== null,
  );
  const availableFxrp = balanceIsLive ? verifiedWalletBalanceFxrp! : 1248.563;

  const navigate = (view: ViewName) => {
    setActiveView(view);
    setMobileNavOpen(false);
  };
  const activeSelectedPayment = selectedPayment
    ? (selectedPayment.transaction.startsWith("demo-") ? demoPayments : currentChainPayments).find(
        (payment) => payment.id === selectedPayment.id,
      ) ?? selectedPayment
    : null;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div>
            <div className="brand-name">XRPFlow</div>
            <div className="brand-caption">Treasury operations</div>
          </div>
          <IconButton label="Close navigation" onClick={() => setMobileNavOpen(false)}>
            <X size={18} />
          </IconButton>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={activeView === item.id ? "nav-item nav-item-active" : "nav-item"}
                onClick={() => navigate(item.id)}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="environment-card">
            <div className="environment-heading">
              <span className={`network-dot ${oracleState === "live" ? "network-live" : ""}`} />
              Coston2 Testnet
            </div>
            <div className="environment-meta">
              {contractState === "valid"
                ? "Contract verified"
                : contractConfigured
                  ? contractState === "checking"
                    ? "Verifying contract"
                    : "Contract invalid"
                  : "Prototype mode"}
            </div>
          </div>
          <div className="version-row">
            <span>XRPFlow</span>
            <span>v0.1.0</span>
          </div>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <IconButton label="Open navigation" onClick={() => setMobileNavOpen(true)}>
              <Menu size={19} />
            </IconButton>
            <div className="mobile-wordmark">XRPFlow</div>
          </div>
          <div className="topbar-actions">
            <div className="network-pill">
              <span className={correctNetwork ? "network-dot network-live" : "network-dot"} />
              {connected ? (correctNetwork ? "Coston2" : "Wrong network") : "Coston2 Testnet"}
            </div>
            {connected ? (
              <button className="wallet-button" type="button" onClick={() => setWalletAddress(null)}>
                <Wallet size={16} aria-hidden="true" />
                <span>{shortAddress(walletAddress)}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            ) : (
              <button className="wallet-button" type="button" onClick={connectWallet} disabled={walletPending}>
                {walletPending ? (
                  <LoaderCircle className="spin" size={16} aria-hidden="true" />
                ) : (
                  <Wallet size={16} aria-hidden="true" />
                )}
                <span>Connect wallet</span>
              </button>
            )}
            <button className="primary-button topbar-new" type="button" onClick={openNewPayment}>
              <Plus size={16} aria-hidden="true" />
              New payment
            </button>
          </div>
        </header>

        <div className="content-wrap">
          {!liveMode && (
            <section className="notice-bar notice-neutral" aria-label="Demo workspace notice">
              <div className="notice-icon">
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div>
                <strong>
                  {!contractConfigured
                    ? "Prototype workspace — no treasury contract is configured"
                    : contractState === "checking"
                      ? "Verifying the configured treasury contract"
                      : contractState === "invalid"
                        ? "Treasury contract configuration failed verification"
                    : connected
                      ? "Demo records — switch to Coston2 for contract mode"
                      : "Viewing a demonstration workspace"}
                </strong>
                <p>
                  {!contractConfigured
                    ? "Payment records, balances, and reserve figures are demo data. The live oracle is labeled separately."
                    : contractState === "checking"
                      ? "Contract actions remain disabled until bytecode and immutable dependencies are verified."
                      : contractState === "invalid"
                        ? "No approval or contract transaction will be requested. Check the address and deployment block."
                    : connected
                      ? "Payment actions are paused until the connected wallet uses Coston2. No local payment will be created."
                      : "Connect a wallet to load Coston2 records. The sample records below are demo data."}
                </p>
              </div>
              {!connected && (
                <button type="button" className="text-button" onClick={connectWallet}>
                  Connect wallet <ArrowRight size={14} aria-hidden="true" />
                </button>
              )}
            </section>
          )}

          {connected && isLiveContract && !correctNetwork && (
            <section className="notice-bar notice-warning" role="alert">
              <div className="notice-icon">
                <AlertTriangle size={18} aria-hidden="true" />
              </div>
              <div>
                <strong>Switch to Coston2 to continue</strong>
                <p>Your wallet is connected to chain {chainId ?? "unknown"}. Payment actions are paused.</p>
              </div>
              <button type="button" className="secondary-button" onClick={switchNetwork}>
                Switch network
              </button>
            </section>
          )}

          {liveMode && chainState !== "ready" && (
            <section
              className={`notice-bar ${chainState === "error" ? "notice-warning" : "notice-neutral"}`}
              role={chainState === "error" ? "alert" : "status"}
            >
              <div className="notice-icon">
                {chainState === "error" ? <AlertTriangle size={18} /> : <LoaderCircle className="spin" size={18} />}
              </div>
              <div>
                <strong>{chainState === "error" ? "Onchain records unavailable" : "Loading Coston2 records"}</strong>
                <p>{chainState === "error" ? chainError : "Reading payment events and current contract state."}</p>
              </div>
              {chainState === "error" && (
                <button type="button" className="secondary-button" onClick={loadChainData}>
                  Retry
                </button>
              )}
            </section>
          )}

          {walletError && (
            <section className="inline-error" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{walletError}</span>
              <button type="button" aria-label="Dismiss wallet message" onClick={() => setWalletError("")}>
                <X size={15} />
              </button>
            </section>
          )}

          <section className="page-heading">
            <div>
              <div className="eyebrow">
                {liveMode ? "Connected treasury" : "Prototype workspace"}
              </div>
              <h1>{viewTitles[activeView].title}</h1>
              <p>{viewTitles[activeView].description}</p>
            </div>
            {activeView !== "settings" && (
              <button className="primary-button heading-action" type="button" onClick={openNewPayment}>
                <Plus size={16} aria-hidden="true" />
                New payment
              </button>
            )}
          </section>

          {activeView === "overview" && (
            <OverviewView
              availableFxrp={availableFxrp}
              balanceIsLive={balanceIsLive}
              oraclePrice={oraclePrice}
              oracleAge={oracleAge}
              oracleState={oracleState}
              reservedTotal={reservedTotal}
              readyCount={readyCount}
              paidThisMonth={paidThisMonth}
              payments={payments}
              onRefreshOracle={refreshOracle}
              onSelectPayment={setSelectedPayment}
              onNavigatePayments={() => setActiveView("payments")}
              onNewPayment={openNewPayment}
              connected={connected}
              correctNetwork={correctNetwork}
              treasuryAddress={TREASURY_ADDRESS}
              contractState={contractState}
            />
          )}

          {activeView === "payments" && (
            <PaymentsView
              payments={filteredPayments}
              search={search}
              statusFilter={statusFilter}
              onSearch={setSearch}
              onStatusFilter={setStatusFilter}
              onSelectPayment={setSelectedPayment}
              onNewPayment={openNewPayment}
            />
          )}

          {activeView === "activity" && (
            <ActivityView activity={activity} onCopy={copyText} demoMode={!liveMode} />
          )}

          {activeView === "settings" && (
            <SettingsView
              oracleAddress={oracleAddress}
              oracleState={oracleState}
              treasuryAddress={TREASURY_ADDRESS}
              contractState={contractState}
              onCopy={copyText}
            />
          )}
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? "mobile-nav-active" : ""}
              onClick={() => navigate(item.id)}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {drawerOpen && (
        <PaymentDrawer
          step={drawerStep}
          form={form}
          setForm={setForm}
          amountUsd={amountUsd}
          oraclePrice={oraclePrice}
          oracleAge={oracleAge}
          oracleState={oracleState}
          estimatedFxrp={estimatedFxrp}
          reserveFxrp={reserveFxrp}
          error={transactionError}
          pending={transactionPending}
          resultTx={resultTx}
          liveMode={liveMode}
          onClose={() => setDrawerOpen(false)}
          onBack={() => setDrawerStep("edit")}
          onReview={reviewPayment}
          onSchedule={schedulePayment}
          onViewPayment={() => {
            setDrawerOpen(false);
            if (lastCreatedPayment) setSelectedPayment(lastCreatedPayment);
          }}
        />
      )}

      {activeSelectedPayment && (
        <PaymentDetail
          payment={activeSelectedPayment}
          onClose={() => setSelectedPayment(null)}
          onCopy={copyText}
          pending={transactionPending}
          canCancel={
            activeSelectedPayment.transaction.startsWith("demo-") ||
            Boolean(
              activeSelectedPayment.payer &&
                walletAddress &&
                activeSelectedPayment.payer.toLowerCase() === walletAddress.toLowerCase(),
            )
          }
          canTopUp={Boolean(
            !activeSelectedPayment.transaction.startsWith("demo-") &&
              activeSelectedPayment.payer &&
              walletAddress &&
              activeSelectedPayment.payer.toLowerCase() === walletAddress.toLowerCase() &&
              (activeSelectedPayment.status === "scheduled" || activeSelectedPayment.status === "ready"),
          )}
          recommendedTopUp={Math.max(
            0,
            (activeSelectedPayment.usdAmount / oraclePrice) * 1.05 - activeSelectedPayment.fxrpReserved,
          )}
          onCancel={() => handlePaymentAction(activeSelectedPayment, "cancel")}
          onClaim={() => handlePaymentAction(activeSelectedPayment, "claim")}
          onRefund={() => handlePaymentAction(activeSelectedPayment, "refund")}
          onTopUp={(value) => handleTopUp(activeSelectedPayment, value)}
        />
      )}

      {toast && (
        <div className={`toast ${toast.tone === "error" ? "toast-error" : ""}`} role={toast.tone === "error" ? "alert" : "status"}>
          {toast.tone === "error" ? <XCircle size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function OverviewView({
  availableFxrp,
  balanceIsLive,
  oraclePrice,
  oracleAge,
  oracleState,
  reservedTotal,
  readyCount,
  paidThisMonth,
  payments,
  onRefreshOracle,
  onSelectPayment,
  onNavigatePayments,
  onNewPayment,
  connected,
  correctNetwork,
  treasuryAddress,
  contractState,
}: {
  availableFxrp: number;
  balanceIsLive: boolean;
  oraclePrice: number;
  oracleAge: number | null;
  oracleState: "loading" | "live" | "fallback" | "stale";
  reservedTotal: number;
  readyCount: number;
  paidThisMonth: number;
  payments: Payment[];
  onRefreshOracle: () => void;
  onSelectPayment: (payment: Payment) => void;
  onNavigatePayments: () => void;
  onNewPayment: () => void;
  connected: boolean;
  correctNetwork: boolean;
  treasuryAddress?: Address;
  contractState: "unconfigured" | "checking" | "valid" | "invalid";
}) {
  return (
    <div className="overview-stack">
      <section className="balance-panel">
        <div className="balance-main">
          <div className="card-label">{balanceIsLive ? "Wallet balance" : "Demo balance"}</div>
          <div className="balance-value">
            {availableFxrp.toLocaleString("en-US", { minimumFractionDigits: 3 })}
            <span>FTestXRP</span>
          </div>
          <div className="balance-usd">{usdFormatter.format(availableFxrp * oraclePrice)} estimated value</div>
          <div className="quote-line">
            <span className={`network-dot ${oracleState === "live" ? "network-live" : ""}`} />
            {oracleState === "live"
              ? `Based on FTSO XRP/USD · updated ${oracleAge ?? 0} sec ago`
              : oracleState === "loading"
                ? "Refreshing FTSO XRP/USD quote"
                : oracleState === "stale"
                  ? "FTSO quote is older than five minutes"
                  : "Showing a labeled demo quote · live RPC unavailable"}
            <button type="button" aria-label="Refresh oracle quote" onClick={onRefreshOracle}>
              <RefreshCw size={13} className={oracleState === "loading" ? "spin" : ""} />
            </button>
          </div>
        </div>
        <div className="balance-actions">
          <button className="primary-button" type="button" onClick={onNewPayment}>
            <Plus size={16} aria-hidden="true" /> New payment
          </button>
          <a className="secondary-button" href="https://faucet.flare.network/coston2" target="_blank" rel="noreferrer">
            Get test assets <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section className="metric-grid" aria-label="Treasury summary">
        <div className="metric-card">
          <div className="metric-icon"><CreditCard size={17} /></div>
          <div>
            <span>Reserved</span>
            <strong>{reservedTotal.toFixed(3)} FTestXRP</strong>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon"><Clock3 size={17} /></div>
          <div>
            <span>Ready to claim</span>
            <strong>{readyCount} {readyCount === 1 ? "payment" : "payments"}</strong>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon"><CircleDollarSign size={17} /></div>
          <div>
            <span>Paid total</span>
            <strong>{usdFormatter.format(paidThisMonth)}</strong>
          </div>
        </div>
      </section>

      <div className="overview-columns">
        <section className="panel upcoming-panel">
          <div className="panel-heading">
            <div>
              <h2>Upcoming payments</h2>
              <p>Scheduled instructions and funds ready to claim.</p>
            </div>
            <button className="text-button" type="button" onClick={onNavigatePayments}>
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Amount</th>
                  <th>Due date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments
                  .filter((payment) => payment.status === "scheduled" || payment.status === "ready")
                  .slice(0, 4)
                  .map((payment) => (
                    <tr key={payment.id} tabIndex={0} onClick={() => onSelectPayment(payment)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelectPayment(payment); } }}>
                      <td>
                        <div className="recipient-cell">
                          <span className="avatar">{payment.recipient.slice(0, 1)}</span>
                          <div><strong>{payment.recipient}</strong><span>{shortAddress(payment.address)}</span></div>
                        </div>
                      </td>
                      <td><strong className="tabular">{usdFormatter.format(payment.usdAmount)}</strong></td>
                      <td>{formatDate(payment.dueAt)}</td>
                      <td><StatusBadge status={payment.status} /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="side-stack">
          <section className="panel status-panel">
            <div className="panel-heading compact">
              <div><h2>System status</h2><p>Current settlement dependencies.</p></div>
            </div>
            <div className="status-list">
              <div className="status-row">
                <span className="status-row-icon"><Network size={16} /></span>
                <div><strong>Coston2 network</strong><span>Chain ID 114</span></div>
                <span className={`small-state ${connected && !correctNetwork ? "state-warning" : "state-ok"}`}>
                  {connected && !correctNetwork ? "Switch" : "Configured"}
                </span>
              </div>
              <div className="status-row">
                <span className="status-row-icon"><ActivityIcon size={16} /></span>
                <div><strong>FTSO XRP/USD</strong><span>{usdFormatter.format(oraclePrice)}</span></div>
                <span className={`small-state ${oracleState === "live" ? "state-ok" : oracleState === "stale" ? "state-warning" : "state-neutral"}`}>
                  {oracleState === "live" ? "Live" : oracleState === "loading" ? "Checking" : oracleState === "stale" ? "Stale" : "Fallback"}
                </span>
              </div>
              <div className="status-row">
                <span className="status-row-icon"><ShieldCheck size={16} /></span>
                <div><strong>Treasury contract</strong><span>{treasuryAddress ? shortAddress(treasuryAddress) : "Not deployed"}</span></div>
                <span className={`small-state ${contractState === "valid" ? "state-ok" : contractState === "invalid" ? "state-warning" : "state-neutral"}`}>
                  {contractState === "valid" ? "Verified" : contractState === "invalid" ? "Invalid" : contractState === "checking" ? "Checking" : "Local"}
                </span>
              </div>
            </div>
          </section>
          <section className="panel pilot-note">
            <div className="pilot-label">Pilot environment</div>
            <h3>Test assets only</h3>
            <p>FTestXRP on Coston2 has no monetary value. Production FXRP uses a different contract on Flare Mainnet.</p>
            <a href="https://dev.flare.network/fassets/reference" target="_blank" rel="noreferrer">
              Review Flare references <ArrowUpRight size={14} />
            </a>
          </section>
        </aside>
      </div>
    </div>
  );
}

function PaymentsView({
  payments,
  search,
  statusFilter,
  onSearch,
  onStatusFilter,
  onSelectPayment,
  onNewPayment,
}: {
  payments: Payment[];
  search: string;
  statusFilter: "all" | PaymentStatus;
  onSearch: (value: string) => void;
  onStatusFilter: (value: "all" | PaymentStatus) => void;
  onSelectPayment: (payment: Payment) => void;
  onNewPayment: () => void;
}) {
  return (
    <section className="panel data-panel">
      <div className="data-toolbar">
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search payments</span>
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search by recipient, address, or reference"
          />
        </label>
        <label className="select-field">
          <SlidersHorizontal size={15} aria-hidden="true" />
          <span className="sr-only">Filter payment status</span>
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilter(event.target.value as "all" | PaymentStatus)}
          >
            <option value="all">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="ready">Ready to claim</option>
            <option value="expired">Expired</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
            <option value="refunded">Refunded</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
      </div>

      {payments.length ? (
        <>
          <div className="table-wrap payment-table">
            <table>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Amount</th>
                  <th>Reserved</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th>Transaction</th>
                  <th><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} tabIndex={0} onClick={() => onSelectPayment(payment)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelectPayment(payment); } }}>
                    <td>
                      <div className="recipient-cell">
                        <span className="avatar">{payment.recipient.slice(0, 1)}</span>
                        <div><strong>{payment.recipient}</strong><span>{shortAddress(payment.address)}</span></div>
                      </div>
                    </td>
                    <td><strong className="tabular">{usdFormatter.format(payment.usdAmount)}</strong></td>
                    <td className="tabular">{payment.fxrpReserved.toFixed(3)} FTestXRP</td>
                    <td>{formatDate(payment.dueAt)}</td>
                    <td><StatusBadge status={payment.status} /></td>
                    <td>
                      {payment.transaction.startsWith("demo-") ? (
                        <span className="demo-tag">Demo</span>
                      ) : (
                        <a
                          className="mono-link"
                          href={`${EXPLORER_URL}/tx/${payment.transaction}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {shortAddress(payment.transaction)} <ExternalLink size={12} />
                        </a>
                      )}
                    </td>
                    <td><ArrowRight size={15} aria-hidden="true" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-payment-list">
            {payments.map((payment) => (
              <button key={payment.id} type="button" className="payment-mobile-card" onClick={() => onSelectPayment(payment)}>
                <div className="payment-mobile-top"><strong>{payment.recipient}</strong><StatusBadge status={payment.status} /></div>
                <div className="payment-mobile-amount">{usdFormatter.format(payment.usdAmount)}</div>
                <div className="payment-mobile-meta"><span>Due {formatDate(payment.dueAt)}</span><span>{shortAddress(payment.address)}</span></div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-icon"><CreditCard size={22} /></div>
          <h2>No payments found</h2>
          <p>Adjust the search or create a payment to test the settlement flow.</p>
          <button className="primary-button" type="button" onClick={onNewPayment}>
            <Plus size={16} /> New payment
          </button>
        </div>
      )}
    </section>
  );
}

function ActivityView({
  activity,
  onCopy,
  demoMode,
}: {
  activity: ActivityItem[];
  onCopy: (value: string, label: string) => void;
  demoMode: boolean;
}) {
  return (
    <section className="panel data-panel">
      <div className="panel-heading activity-heading">
        <div><h2>{demoMode ? "Workspace events" : "Onchain creations"}</h2><p>Times are shown in UTC.</p></div>
        <span className="demo-tag">{demoMode ? "Demo records" : "Coston2"}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Event</th><th>Account</th><th>Amount</th><th>Time</th><th>Transaction</th></tr></thead>
          <tbody>
            {activity.map((item) => (
              <tr key={item.id}>
                <td><div className="event-cell"><span className="event-dot" /><strong>{item.event}</strong></div></td>
                <td>{item.account}</td>
                <td><strong className="tabular">{item.amount}</strong></td>
                <td title={item.timestamp}>{formatDate(item.timestamp, true)}</td>
                <td>
                  <div className="hash-cell">
                    <span className="mono">{shortAddress(item.transaction)}</span>
                    <IconButton label="Copy transaction hash" onClick={() => onCopy(item.transaction, "Transaction hash")}>
                      <Copy size={13} />
                    </IconButton>
                    {!item.transaction.startsWith("demo-") && (
                      <a href={`${EXPLORER_URL}/tx/${item.transaction}`} target="_blank" rel="noreferrer" aria-label="Open transaction in explorer">
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SettingsView({
  oracleAddress,
  oracleState,
  treasuryAddress,
  contractState,
  onCopy,
}: {
  oracleAddress: Address | null;
  oracleState: "loading" | "live" | "fallback" | "stale";
  treasuryAddress?: Address;
  contractState: "unconfigured" | "checking" | "valid" | "invalid";
  onCopy: (value: string, label: string) => void;
}) {
  const rows = [
    { label: "Network", value: "Flare Testnet Coston2", detail: "Chain ID 114", link: EXPLORER_URL },
    { label: "Treasury contract", value: treasuryAddress ? shortAddress(treasuryAddress) : "Not deployed", detail: contractState === "valid" ? "Verified on Coston2" : contractState === "invalid" ? "Configured address failed verification" : contractState === "checking" ? "Verifying bytecode and dependencies" : "Local prototype mode", copy: treasuryAddress },
    { label: "Payment token", value: shortAddress(FTEST_XRP), detail: "FTestXRP · 6 decimals · test asset", copy: FTEST_XRP, link: `${EXPLORER_URL}/address/${FTEST_XRP}` },
    { label: "Contract registry", value: shortAddress(CONTRACT_REGISTRY), detail: "FlareContractRegistry", copy: CONTRACT_REGISTRY, link: `${EXPLORER_URL}/address/${CONTRACT_REGISTRY}` },
    { label: "Oracle source", value: oracleAddress ? shortAddress(oracleAddress) : "Resolving through registry", detail: `FTSOv2 XRP/USD · ${oracleState === "live" ? "live" : oracleState === "loading" ? "checking" : oracleState === "stale" ? "stale quote" : "fallback quote"}`, copy: oracleAddress || undefined },
    { label: "Reserve buffer", value: "5.00%", detail: "Maximum FXRP reserved above the current quote" },
    { label: "Quote freshness", value: "5 minutes", detail: "Settlement fails closed when the quote is older" },
  ];
  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="panel-heading"><div><h2>Settlement configuration</h2><p>Public values used by the current workspace.</p></div></div>
        <div className="settings-list">
          {rows.map((row) => (
            <div className="settings-row" key={row.label}>
              <div><span>{row.label}</span><p>{row.detail}</p></div>
              <div className="settings-value">
                <strong className={row.copy ? "mono" : ""}>{row.value}</strong>
                {row.copy && <IconButton label={`Copy ${row.label}`} onClick={() => onCopy(row.copy!, row.label)}><Copy size={13} /></IconButton>}
                {row.link && <a href={row.link} target="_blank" rel="noreferrer" aria-label={`Open ${row.label}`}><ExternalLink size={13} /></a>}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="test-asset-note">
        <AlertTriangle size={18} aria-hidden="true" />
        <div><strong>FTestXRP is a test asset</strong><p>This workspace uses Coston2 FTestXRP for demonstrations. It is not production FXRP and has no monetary value.</p></div>
      </section>
    </div>
  );
}

function PaymentDrawer({
  step,
  form,
  setForm,
  amountUsd,
  oraclePrice,
  oracleAge,
  oracleState,
  estimatedFxrp,
  reserveFxrp,
  error,
  pending,
  resultTx,
  liveMode,
  onClose,
  onBack,
  onReview,
  onSchedule,
  onViewPayment,
}: {
  step: "edit" | "review" | "success";
  form: { recipient: string; label: string; amount: string; dueAt: string; reference: string };
  setForm: React.Dispatch<React.SetStateAction<{ recipient: string; label: string; amount: string; dueAt: string; reference: string }>>;
  amountUsd: number;
  oraclePrice: number;
  oracleAge: number | null;
  oracleState: "loading" | "live" | "fallback" | "stale";
  estimatedFxrp: number;
  reserveFxrp: number;
  error: string;
  pending: boolean;
  resultTx: Hash | `demo-${string}` | null;
  liveMode: boolean;
  onClose: () => void;
  onBack: () => void;
  onReview: () => void;
  onSchedule: () => void;
  onViewPayment: () => void;
}) {
  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-labelledby="payment-drawer-title">
      <button className="drawer-backdrop" type="button" aria-label="Close payment form" onClick={onClose} disabled={pending} />
      <section className="drawer">
        <div className="drawer-header">
          <div>
            <span>{step === "edit" ? "Payment instruction" : step === "review" ? "Confirm details" : "Instruction created"}</span>
            <h2 id="payment-drawer-title">
              {step === "edit" ? "New payment" : step === "review" ? "Review payment" : "Payment scheduled"}
            </h2>
          </div>
          <IconButton label="Close payment form" onClick={onClose} disabled={pending}><X size={18} /></IconButton>
        </div>

        {step === "edit" && (
          <>
            <div className="drawer-body">
              <div className="field-group">
                <label htmlFor="recipient">Recipient address</label>
                <div className="input-with-icon"><Wallet size={16} /><input id="recipient" value={form.recipient} onChange={(event) => setForm((current) => ({ ...current, recipient: event.target.value }))} spellCheck={false} /></div>
                <p>Use a Coston2-compatible EVM address.</p>
              </div>
              <div className="field-group">
                <label htmlFor="label">Recipient label <span>Optional</span></label>
                <div className="input-with-icon"><UserRound size={16} /><input id="label" value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} /></div>
              </div>
              <div className="form-grid">
                <div className="field-group">
                  <label htmlFor="amount">Payment amount</label>
                  <div className="currency-input"><span>$</span><input id="amount" inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /><em>USD</em></div>
                </div>
                <div className="field-group">
                  <label htmlFor="due-date">Due date <span>UTC</span></label>
                  <div className="input-with-icon"><CalendarDays size={16} /><input id="due-date" type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} /></div>
                </div>
              </div>
              <div className="field-group">
                <label htmlFor="reference">Reference <span>Optional</span></label>
                <div className="input-with-icon"><FileText size={16} /><input id="reference" value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} /></div>
              </div>

              <div className="settlement-rule">
                <div className="settlement-rule-head"><ShieldCheck size={17} /><strong>Settlement rule</strong></div>
                <p>The FTestXRP amount is recalculated using the FTSO XRP/USD price when the payment is claimed. The 5% reserve caps the payer&apos;s exposure.</p>
              </div>

              <QuoteSummary
                amountUsd={amountUsd}
                oraclePrice={oraclePrice}
                oracleState={oracleState}
                age={oracleAge}
                estimatedFxrp={estimatedFxrp}
                reserveFxrp={reserveFxrp}
              />
              {error && <div className="form-error" role="alert"><AlertTriangle size={15} />{error}</div>}
            </div>
            <div className="drawer-footer"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="button" onClick={onReview}>Review payment <ArrowRight size={15} /></button></div>
          </>
        )}

        {step === "review" && (
          <>
            <div className="drawer-body review-body">
              <div className="review-amount"><span>Payment amount</span><strong>{usdFormatter.format(amountUsd)}</strong><p>Reserved as up to {reserveFxrp.toFixed(6)} FTestXRP</p></div>
              <div className="review-list">
                <div><span>Recipient</span><strong>{form.label || shortAddress(form.recipient)}</strong></div>
                <div><span>Wallet address</span><strong className="mono">{shortAddress(form.recipient, 10, 8)}</strong></div>
                <div><span>Due date (UTC)</span><strong>{formatDate(new Date(parseDueAt(form.dueAt)).toISOString(), true)}</strong></div>
                <div><span>Reference</span><strong>{form.reference || "No reference"}</strong></div>
                <div><span>Current XRP/USD</span><strong>{usdFormatter.format(oraclePrice)}</strong></div>
                <div><span>Execution</span><strong>{liveMode ? "Coston2 contract" : "Demo workspace"}</strong></div>
              </div>
              {!liveMode && <div className="mode-note"><AlertTriangle size={16} /><div><strong>Prototype mode</strong><p>This instruction will be recorded locally because a connected Coston2 contract is not configured.</p></div></div>}
              {error && <div className="form-error" role="alert"><AlertTriangle size={15} />{error}</div>}
            </div>
            <div className="drawer-footer"><button className="secondary-button" type="button" onClick={onBack} disabled={pending}>Back</button><button className="primary-button" type="button" onClick={onSchedule} disabled={pending}>{pending ? <><LoaderCircle className="spin" size={15} /> Scheduling payment…</> : <>Schedule payment <ArrowRight size={15} /></>}</button></div>
          </>
        )}

        {step === "success" && (
          <div className="success-state">
            <div className="success-icon"><Check size={26} /></div>
            <h3>Payment scheduled</h3>
            <p>{usdFormatter.format(amountUsd)} is reserved for {form.label || shortAddress(form.recipient)} and will be claimable on {formatDate(new Date(parseDueAt(form.dueAt)).toISOString())} UTC.</p>
            <div className="success-reference"><span>Settlement</span><strong>{liveMode ? "Recorded on Coston2" : "Added to this demo session"}</strong>{resultTx && !resultTx.startsWith("demo-") && <a href={`${EXPLORER_URL}/tx/${resultTx}`} target="_blank" rel="noreferrer">View transaction <ExternalLink size={13} /></a>}</div>
            <div className="success-actions"><button type="button" className="secondary-button" onClick={onClose}>Close</button><button type="button" className="primary-button" onClick={onViewPayment}>View payment</button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function QuoteSummary({ amountUsd, oraclePrice, oracleState, age, estimatedFxrp, reserveFxrp }: { amountUsd: number; oraclePrice: number; oracleState: string; age: number | null; estimatedFxrp: number; reserveFxrp: number }) {
  return (
    <div className="quote-summary">
      <div><span>Payment amount</span><strong>{usdFormatter.format(amountUsd)}</strong></div>
      <div><span>Current XRP/USD price</span><strong>{usdFormatter.format(oraclePrice)}</strong></div>
      <div><span>Estimated settlement</span><strong>{estimatedFxrp.toFixed(6)} FTestXRP</strong></div>
      <div><span>Maximum reserve</span><strong>{reserveFxrp.toFixed(6)} FTestXRP</strong></div>
      <div className="quote-source"><span>Oracle status</span><strong className={oracleState === "live" ? "quote-live" : ""}>{oracleState === "live" ? `Live · ${age ?? 0} sec ago` : oracleState === "loading" ? "Refreshing" : oracleState === "stale" ? "Stale" : "Demo fallback"}</strong></div>
    </div>
  );
}

function PaymentDetail({
  payment,
  onClose,
  onCopy,
  onCancel,
  onClaim,
  onRefund,
  onTopUp,
  pending,
  canCancel,
  canTopUp,
  recommendedTopUp,
}: {
  payment: Payment;
  onClose: () => void;
  onCopy: (value: string, label: string) => void;
  onCancel: () => void | Promise<void>;
  onClaim: () => void | Promise<void>;
  onRefund: () => void | Promise<void>;
  onTopUp: (value: string) => void | Promise<void>;
  pending: boolean;
  canCancel: boolean;
  canTopUp: boolean;
  recommendedTopUp: number;
}) {
  const [topUpAmount, setTopUpAmount] = useState(
    recommendedTopUp > 0 ? recommendedTopUp.toFixed(6) : "",
  );
  const rows = [
    ["Recipient", payment.recipient],
    ["Wallet address", payment.address],
    ["USD amount", usdFormatter.format(payment.usdAmount)],
    ["Reserved FTestXRP", `${payment.fxrpReserved.toFixed(6)} FTestXRP`],
    ["Settlement rule", "FTSO XRP/USD at claim time"],
    ["Due date (UTC)", formatDate(payment.dueAt, true)],
    ["Reference", payment.reference],
    [payment.transaction.startsWith("demo-") ? "Demo record ID" : "Contract payment ID", `#${payment.id}`],
  ];
  const dueReached = payment.status === "ready" || payment.status === "expired" || payment.status === "paid" || payment.status === "refunded";
  const finalState = {
    scheduled: ["Awaiting due date", "Payment can still be cancelled"],
    ready: ["Ready to claim", "Settlement is available"],
    expired: ["Payment expired", "Reserve can be returned to the payer"],
    paid: ["Payment paid", "Settlement complete"],
    cancelled: ["Payment cancelled", "Reserve returned to the payer"],
    refunded: ["Payment refunded", "Expired reserve returned to the payer"],
  }[payment.status];
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <button type="button" className="modal-backdrop" aria-label="Close payment details" onClick={onClose} disabled={pending} />
      <section className="detail-modal">
        <div className="detail-header"><div><span>Payment #{payment.id}</span><h2 id="detail-title">{usdFormatter.format(payment.usdAmount)}</h2><StatusBadge status={payment.status} /></div><IconButton label="Close payment details" onClick={onClose} disabled={pending}><X size={18} /></IconButton></div>
        <div className="detail-body">
          <div className="detail-list">
            {rows.map(([label, value]) => <div key={label}><span>{label}</span><strong className={label.includes("address") ? "mono" : ""}>{label.includes("address") ? shortAddress(value, 10, 8) : value}</strong></div>)}
          </div>
          <div className="transaction-block"><div><span>Creation transaction</span><strong className="mono">{shortAddress(payment.transaction, 10, 8)}</strong></div><div><IconButton label="Copy transaction hash" onClick={() => onCopy(payment.transaction, "Transaction hash")}><Copy size={14} /></IconButton>{!payment.transaction.startsWith("demo-") && <a href={`${EXPLORER_URL}/tx/${payment.transaction}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a>}</div></div>
          {canTopUp && (
            <div className="topup-panel">
              <div><strong>Add reserve</strong><p>{recommendedTopUp > 0 ? `The current quote suggests at least ${recommendedTopUp.toFixed(6)} additional FTestXRP.` : "The current quote is covered; add reserve only if you want a larger buffer."}</p></div>
              <div className="topup-controls"><label><span className="sr-only">Top-up amount in FTestXRP</span><input inputMode="decimal" value={topUpAmount} placeholder="0.000000" onChange={(event) => setTopUpAmount(event.target.value)} disabled={pending} /></label><button type="button" className="secondary-button" onClick={() => onTopUp(topUpAmount)} disabled={pending || !topUpAmount.trim()}>{pending ? "Submitting…" : "Add reserve"}</button></div>
            </div>
          )}
          <div className="timeline"><h3>Timeline</h3><div className="timeline-item timeline-done"><span /><div><strong>Payment created</strong><p>{formatDate(payment.createdAt, true)}</p></div></div><div className="timeline-item timeline-done"><span /><div><strong>Funds reserved</strong><p>{payment.fxrpReserved.toFixed(3)} FTestXRP</p></div></div><div className={`timeline-item ${dueReached ? "timeline-done" : ""}`}><span /><div><strong>Due date</strong><p>{formatDate(payment.dueAt, true)} UTC</p></div></div><div className={`timeline-item ${payment.status !== "scheduled" ? "timeline-done" : ""}`}><span /><div><strong>{finalState[0]}</strong><p>{finalState[1]}</p></div></div></div>
        </div>
        <div className="detail-footer"><button className="secondary-button" type="button" onClick={onClose} disabled={pending}>Close</button>{payment.status === "scheduled" && canCancel && <button className="danger-button" type="button" onClick={onCancel} disabled={pending}>{pending ? "Submitting…" : "Cancel payment"}</button>}{payment.status === "ready" && <button className="primary-button" type="button" onClick={onClaim} disabled={pending}>{pending ? "Submitting…" : "Execute settlement"}</button>}{payment.status === "expired" && <button className="primary-button" type="button" onClick={onRefund} disabled={pending}>{pending ? "Submitting…" : "Refund payer"}</button>}</div>
      </section>
    </div>
  );
}
