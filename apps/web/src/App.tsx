import { useLocation, useNavigate } from 'react-router-dom';
import { QuotationPage } from './features/documents/QuotationPage';
import { O2DPage } from './features/o2d/O2DPage';
import { DispatchPage } from './features/documents/DispatchPage';
import { EnquiryCRM } from './features/enquiries/EnquiryCRM';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Database,
  FileText,
  LayoutDashboard,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react';
import { getGoogleHealth, getHealth } from './api/health';

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const module = path.startsWith('/crr')
    ? 'CRR'
    : path.startsWith('/nbd')
      ? 'NBD'
      : 'Overview';
  const setModule = (value: 'Overview' | 'CRR' | 'NBD') =>
    navigate(value === 'Overview' ? '/' : `/${value.toLowerCase()}`);
  const special = path.startsWith('/quotation/') ? (
    <QuotationPage key={path} type={path.endsWith('nbd') ? 'NBD' : 'CRR'} />
  ) : path.startsWith('/o2d/') ? (
    <O2DPage key={path} branch={path.endsWith('mum') ? 'MUM' : 'FBD'} />
  ) : path.startsWith('/dispatch/') ? (
    <DispatchPage key={path} branch={path.endsWith('mum') ? 'MUM' : 'FBD'} />
  ) : null;
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const api = useQuery({ queryKey: ['health'], queryFn: getHealth });
  const google = useQuery({
    queryKey: ['google-health'],
    queryFn: getGoogleHealth,
    enabled: api.isSuccess,
  });
  const refreshing = api.isFetching || google.isFetching;
  const connected =
    google.data?.sources.filter(
      (s) => (s.type === 'CRR' || s.type === 'NBD') && s.status === 'connected',
    ).length ?? 0;
  const refresh = () => {
    void api.refetch();
    void google.refetch();
  };
  return (
    <div className="erp-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            CRE
            <span />
          </span>
          <div>
            <strong>CRE WORKSPACE</strong>
            <small>Enquiry & Order Management</small>
          </div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={
              module === 'Overview' && !special ? 'nav-item active' : 'nav-item'
            }
            onClick={() => setModule('Overview')}
          >
            <LayoutDashboard size={18} />
            Overview
          </button>
          <div className="nav-label">ENQUIRY MANAGEMENT</div>
          {(['CRR', 'NBD'] as const).map((type) => (
            <button
              key={type}
              className={module === type ? 'nav-item active' : 'nav-item'}
              onClick={() => setModule(type)}
            >
              <ClipboardList size={18} />
              {type} enquiries
              <ChevronRight size={14} className="nav-chevron" />
            </button>
          ))}
          <div className="nav-label">ORDER MANAGEMENT</div>
          <button
            className={path === '/o2d/fbd' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('/o2d/fbd')}
          >
            <Truck size={18} />
            O2D Faridabad
          </button>
          <button
            className={path === '/o2d/mum' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('/o2d/mum')}
          >
            <Truck size={18} />
            O2D Mumbai
          </button>
          <button
            className="nav-item"
            onClick={() => navigate('/quotation/crr')}
          >
            <FileText size={18} />
            Quotations
          </button>
          <button
            className="nav-item"
            onClick={() => navigate('/dispatch/fbd')}
          >
            <Truck size={18} />
            Dispatch orders
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setConnectionsOpen(true)}>
            <Settings2 size={18} />
            Connections
          </button>
          <div className="workspace-footer">
            <span className="avatar">DM</span>
            <div>
              <strong>DM Metal</strong>
              <small>Internal business workspace</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <strong>
              {path.startsWith('/o2d/')
                ? `O2D ${path.endsWith('mum') ? 'MUM' : 'FBD'}`
                : module === 'Overview'
                  ? 'Overview'
                  : `${module} enquiries`}
            </strong>
          </div>
          <button
            className="connection-indicator"
            onClick={() => setConnectionsOpen(true)}
          >
            <span className={connected === 2 ? 'dot online' : 'dot'} />
            {refreshing
              ? 'Checking connection'
              : connected === 2
                ? 'Sheets connected'
                : 'Connection pending'}
            <ChevronRight size={13} />
          </button>
        </header>
        <main className="workspace-main">
          {!path.startsWith('/o2d/') && (
            <div className="page-heading">
              <div>
                <div className="eyebrow">ENQUIRY & ORDER MANAGEMENT</div>
                <h1>
                  {special
                    ? path.startsWith('/quotation/')
                      ? 'Quotation workspace'
                      : path.startsWith('/o2d/')
                        ? 'Order to Delivery'
                        : 'Dispatch Order Builder'
                    : module === 'Overview'
                      ? 'Business overview'
                      : `${module} enquiry register`}
                </h1>
                <p>
                  {module === 'Overview'
                    ? 'Your enquiries, quotations and orders. One connected workspace.'
                    : `Manage ${module} customers and material enquiries from one register.`}
                </p>
              </div>
              <button
                className="button secondary"
                disabled={refreshing}
                onClick={refresh}
              >
                <RefreshCw
                  size={15}
                  className={refreshing ? 'animate-spin' : ''}
                />
                Refresh
              </button>
            </div>
          )}
          {connected < 2 && (
            <div className="connection-banner">
              <span className="banner-icon">
                <Database size={17} />
              </span>
              <div>
                <strong>
                  {api.isError
                    ? 'The application server is unavailable'
                    : 'Connect your business data'}
                </strong>
                <p>
                  {api.isError
                    ? 'Start the backend and refresh to check the connection.'
                    : 'Your Google Sheets connection is pending. Enquiry data will be available after connection and register integration.'}
                </p>
              </div>
              <button onClick={() => setConnectionsOpen(true)}>
                Connection details
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {special ? (
            special
          ) : module === 'Overview' ? (
            <>
              <div className="section-heading">
                <h2>Enquiry workspaces</h2>
                <span>Choose a register to get started</span>
              </div>
              <div className="module-grid">
                {(['CRR', 'NBD'] as const).map((type, index) => (
                  <button
                    key={type}
                    className={`module-card ${index ? 'purple' : ''}`}
                    onClick={() => setModule(type)}
                  >
                    <div className="module-card-top">
                      <span className="module-icon">
                        <Building2 size={25} />
                      </span>
                      <ArrowUpRight size={21} />
                    </div>
                    <div className="module-caption">
                      {index ? 'NEW BUSINESS' : 'CUSTOMER RELATIONSHIPS'}
                    </div>
                    <h2>{type} enquiries</h2>
                    <p>
                      {index
                        ? 'Organise new customer enquiries and follow their progress.'
                        : 'Keep customer enquiries and material requirements together.'}
                    </p>
                    <div className="module-tags">
                      <span>Enquiries</span>
                      <span>Materials</span>
                      <span>Quotations</span>
                    </div>
                    <div className="module-card-bottom">
                      <span>Open workspace</span>
                      <ArrowRight size={17} />
                    </div>
                  </button>
                ))}
              </div>
              <div className="lower-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>From enquiry to delivery</h2>
                    <span>WORKFLOW</span>
                  </div>
                  <div className="workflow">
                    {[
                      {
                        icon: ClipboardList,
                        title: 'Enquiry',
                        text: 'Customer & materials',
                      },
                      {
                        icon: FileText,
                        title: 'Quotation',
                        text: 'Pricing & approval',
                      },
                      {
                        icon: ShieldCheck,
                        title: 'Order',
                        text: 'Won materials',
                      },
                      { icon: Truck, title: 'Delivery', text: 'FBD & MUM' },
                    ].map((step, i) => (
                      <div className="workflow-step" key={step.title}>
                        <span className="step-icon">
                          <step.icon size={19} />
                        </span>
                        <small>0{i + 1}</small>
                        <strong>{step.title}</strong>
                        <p>{step.text}</p>
                      </div>
                    ))}
                  </div>
                  <div className="panel-footnote">
                    Business workflows will be enabled after the read-only
                    connection is verified.
                  </div>
                </section>
                <section className="panel source-panel">
                  <div className="panel-heading">
                    <h2>Data sources</h2>
                    <Database size={16} />
                  </div>
                  {(['CRR', 'NBD'] as const).map((type) => (
                    <div className="source-row" key={type}>
                      <span className="source-icon">
                        <Database size={16} />
                      </span>
                      <div>
                        <strong>{type} register</strong>
                        <small>Google Sheets / FMS</small>
                      </div>
                      <span
                        className={
                          google.data?.sources.find((s) => s.type === type)
                            ?.status === 'connected'
                            ? 'source-status ready'
                            : 'source-status'
                        }
                      >
                        {google.data?.sources.find((s) => s.type === type)
                          ?.status === 'connected'
                          ? 'Connected'
                          : 'Pending'}
                      </span>
                    </div>
                  ))}
                  <button
                    className="text-button"
                    onClick={() => setConnectionsOpen(true)}
                  >
                    Manage connections
                    <ArrowRight size={14} />
                  </button>
                </section>
              </div>
            </>
          ) : (
            <EnquiryCRM key={module} type={module} />
          )}
          <footer className="main-footer">
            <span>CRE / Enquiry & Order Management</span>
            <span>
              <ShieldCheck size={13} />
              Google Sheets connected
            </span>
          </footer>
        </main>
      </div>
      {connectionsOpen && (
        <div
          className="drawer-backdrop"
          onClick={() => setConnectionsOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-title"
            className="connection-drawer"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setConnectionsOpen(false);
            }}
          >
            <div className="drawer-heading">
              <div>
                <div className="eyebrow">WORKSPACE SETTINGS</div>
                <h2 id="connection-title">Data connections</h2>
              </div>
              <button
                autoFocus
                aria-label="Close connection details"
                className="icon-button"
                onClick={() => setConnectionsOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="drawer-intro">
              Connect the source spreadsheets to this workspace. Credentials are
              stored only on your server.
            </p>
            <div className="backend-status">
              <span className={api.isSuccess ? 'dot online' : 'dot'} />
              Application server
              <strong>{api.isSuccess ? 'Online' : 'Unavailable'}</strong>
            </div>
            {google.data?.sources.map((source) => (
              <div className="connection-detail" key={source.type}>
                <h3>
                  {source.type} / FMS
                  <span>
                    {source.status === 'connected' ? 'Connected' : 'Pending'}
                  </span>
                </h3>
                <p>{source.message}</p>
              </div>
            ))}
            {google.isError && (
              <p role="alert">
                Unable to check Google access. Retry the connection check.
              </p>
            )}
            <div className="setup-help">
              <CircleHelp size={20} />
              <h3>What needs to be configured?</h3>
              <p>
                Add these service-account values to the project&apos;s{' '}
                <code>.env</code> file:
              </p>
              <ul>
                <li>
                  <code>GOOGLE_PROJECT_ID</code>
                </li>
                <li>
                  <code>GOOGLE_CLIENT_EMAIL</code>
                </li>
                <li>
                  <code>GOOGLE_PRIVATE_KEY</code>
                </li>
              </ul>
              <p>
                Share both spreadsheets with the service-account email, then
                restart the backend. Full instructions are in README.md.
              </p>
            </div>
            <button
              className="button primary"
              disabled={refreshing}
              onClick={refresh}
            >
              <RefreshCw size={15} />
              {refreshing ? 'Checking...' : 'Recheck connections'}
            </button>
            <p className="drawer-note">
              This check reads spreadsheet headers only. It does not modify your
              data.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
