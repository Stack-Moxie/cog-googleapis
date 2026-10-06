export class PostmasterMonitorError extends Error {
  public kind: 'reconnect' | 'config' | 'request';

  constructor(kind: 'reconnect' | 'config' | 'request', message: string) {
    super(message);
    this.name = 'PostmasterMonitorError';
    this.kind = kind;
  }
}

export interface MetricDefinition {
  label: string;
  standardMetric: string;
  filter?: string;
  headline: string;
  why: string;
  whatToCheck: string;
  noDataTitle: string;
}

export const POSTMASTER_METRICS: Record<string, MetricDefinition> = {
  'spam rate': {
    label: 'Spam rate',
    standardMetric: 'SPAM_RATE',
    headline: 'Gmail spam rate',
    why: 'Higher spam complaints can increase the likelihood that future messages are sent to spam.',
    whatToCheck: 'Look for recent campaigns with unusually high complaints, confirm recipients opted in, make unsubscribing easy, and consider reducing sends to unengaged recipients.',
    noDataTitle: 'No spam-rate issue detected.',
  },
  'spf authentication success': {
    label: 'SPF authentication success',
    standardMetric: 'AUTH_SUCCESS_RATE',
    filter: 'auth_type=spf',
    headline: 'SPF authentication',
    why: 'SPF tells Gmail which servers are allowed to send mail for this domain.',
    whatToCheck: 'Confirm the domain publishes an SPF record that includes the services that send its mail.',
    noDataTitle: 'No SPF issue detected.',
  },
  'dkim authentication success': {
    label: 'DKIM authentication success',
    standardMetric: 'AUTH_SUCCESS_RATE',
    filter: 'auth_type=dkim',
    headline: 'DKIM authentication',
    why: 'DKIM lets Gmail verify that messages were signed by this domain.',
    whatToCheck: 'Confirm mail is signed with DKIM and the public key is published in DNS.',
    noDataTitle: 'No DKIM issue detected.',
  },
  'dmarc authentication success': {
    label: 'DMARC authentication success',
    standardMetric: 'AUTH_SUCCESS_RATE',
    filter: 'auth_type=dmarc',
    headline: 'DMARC authentication',
    why: 'DMARC tells Gmail what to do when SPF or DKIM does not align with the From domain.',
    whatToCheck: 'Confirm the domain publishes a DMARC record and that SPF or DKIM aligns with the From domain.',
    noDataTitle: 'No DMARC issue detected.',
  },
  'inbound tls rate': {
    label: 'Inbound TLS rate',
    standardMetric: 'TLS_ENCRYPTION_RATE',
    filter: 'traffic_direction=inbound',
    headline: 'Inbound encryption',
    why: 'This is the share of messages Gmail received from this domain over an encrypted connection.',
    whatToCheck: 'Confirm the sending service delivers mail to Gmail using TLS.',
    noDataTitle: 'No inbound encryption issue detected.',
  },
  'outbound tls rate': {
    label: 'Outbound TLS rate',
    standardMetric: 'TLS_ENCRYPTION_RATE',
    filter: 'traffic_direction=outbound',
    headline: 'Outbound encryption',
    why: 'This is the share of messages encrypted when Gmail sent them onward.',
    whatToCheck: 'Confirm receiving servers advertise TLS. Gmail can only encrypt the connection when the next server supports it.',
    noDataTitle: 'No outbound encryption issue detected.',
  },
  'delivery error rate': {
    label: 'Delivery error rate',
    standardMetric: 'DELIVERY_ERROR_RATE',
    headline: 'Delivery error rate',
    why: 'This is the share of messages Gmail rejected or temporarily failed.',
    whatToCheck: 'Review recent sending volume, list quality, and authentication. A spike in delivery errors often follows a complaint or reputation change.',
    noDataTitle: 'No delivery-error issue detected.',
  },
};

export const METRIC_EXPRESSION = Object.keys(POSTMASTER_METRICS).join('|');

export interface MetricPoint {
  date: string | null;
  value: number;
}

export interface ComplianceReport {
  status: 'COMPLIANT' | 'NEEDS_WORK' | null;
  needsWork: string[];
}

const REQUIREMENT_LABELS: Record<string, string> = {
  SPF: 'SPF',
  DKIM: 'DKIM',
  SPF_AND_DKIM: 'SPF and DKIM',
  DMARC_POLICY: 'DMARC policy',
  DMARC_ALIGNMENT: 'DMARC alignment',
  MESSAGE_FORMATTING: 'Message formatting',
  DNS_RECORDS: 'DNS records',
  ENCRYPTION: 'Encryption',
  USER_REPORTED_SPAM_RATE: 'Spam rate',
  ONE_CLICK_UNSUBSCRIBE: 'One-click unsubscribe',
  HONOR_UNSUBSCRIBE: 'Honor unsubscribe',
};

export function parsePercent(raw: string): number {
  const text = String(raw).trim().replace(/%$/, '');
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new PostmasterMonitorError('config', `Expected a percentage such as 0.10%, and received "${raw}".`);
  }
  return value / 100;
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}

export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function ageInDays(isoDate: string, today: Date = new Date()): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  const dataDay = Date.UTC(year, month - 1, day);
  const todayDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((todayDay - dataDay) / 86400000);
}

export function isoDaysAgo(days: number, today: Date = new Date()): string {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function toGoogleDate(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year, month, day };
}

export function normalizeCompliance(payload: any): ComplianceReport {
  const data = payload && (payload.complianceData || payload);
  if (!data) {
    return { status: null, needsWork: [] };
  }
  const needsWork: string[] = [];
  const rows = Array.isArray(data.rowData) ? data.rowData : [];
  rows.forEach((row) => {
    const state = row && row.status && row.status.status;
    if (state === 'NEEDS_WORK') {
      needsWork.push(REQUIREMENT_LABELS[row.requirement] || row.requirement);
    }
  });
  ['oneClickUnsubscribeVerdict', 'honorUnsubscribeVerdict'].forEach((key) => {
    const verdict = data[key];
    const state = verdict && verdict.status && verdict.status.status;
    if (state === 'NEEDS_WORK') {
      const label = key === 'oneClickUnsubscribeVerdict' ? 'One-click unsubscribe' : 'Honor unsubscribe';
      if (needsWork.indexOf(label) === -1) {
        needsWork.push(label);
      }
    }
  });
  const aggregate = data.deliverabilityStatusVerdict
    && data.deliverabilityStatusVerdict.state
    && data.deliverabilityStatusVerdict.state.status;
  if (aggregate === 'COMPLIANT' || aggregate === 'NEEDS_WORK') {
    return { status: aggregate, needsWork };
  }
  if (needsWork.length) {
    return { status: 'NEEDS_WORK', needsWork };
  }
  if (rows.length) {
    return { status: 'COMPLIANT', needsWork };
  }
  return { status: null, needsWork: [] };
}

export function normalizeStats(payload: any): MetricPoint[] {
  const rows = payload && Array.isArray(payload.domainStats) ? payload.domainStats : [];
  return rows.map((row) => {
    const value = row && row.value ? row.value : {};
    let number = null;
    if (value.doubleValue !== undefined && value.doubleValue !== null) {
      number = Number(value.doubleValue);
    } else if (value.floatValue !== undefined && value.floatValue !== null) {
      number = Number(value.floatValue);
    } else if (value.intValue !== undefined && value.intValue !== null) {
      number = Number(value.intValue);
    }
    let date = null;
    if (row && row.date && row.date.year) {
      const month = String(row.date.month).padStart(2, '0');
      const day = String(row.date.day).padStart(2, '0');
      date = `${row.date.year}-${month}-${day}`;
    }
    return { date, value: number };
  }).filter((point) => point.value !== null && Number.isFinite(point.value));
}

export function monitorMessage(kind: 'reconnect' | 'config' | 'request', domain: string): string {
  if (kind === 'reconnect') {
    return `Reconnect Google Postmaster\n\nStack Moxie could not check ${domain} because the Google connection needs to be updated. Reconnect Google APIs to resume monitoring.`;
  }
  if (kind === 'config') {
    return `Stack Moxie could not check ${domain}. Confirm the domain is the one registered in Google Postmaster Tools.`;
  }
  return `Stack Moxie could not check ${domain} because Google Postmaster did not respond. Try the scenario again.`;
}

export function assertOperator(operator: string): string {
  if (operator === 'below') {
    return 'be less than';
  }
  if (operator === 'above') {
    return 'be greater than';
  }
  if (operator === 'exactly') {
    return 'be';
  }
  return operator;
}
