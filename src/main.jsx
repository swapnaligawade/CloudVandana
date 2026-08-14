import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const objects = ['Account', 'Opportunity', 'Lead', 'Contact', 'Case'];
const recordsPerPage = 20;
const fallbackFields = {
  Account: [
    { name: 'Name', label: 'Name', type: 'string', required: true, createable: true, updateable: true },
    { name: 'Phone', label: 'Phone', type: 'phone', required: false, createable: true, updateable: true },
    { name: 'Website', label: 'Website', type: 'url', required: false, createable: true, updateable: true },
    { name: 'Industry', label: 'Industry', type: 'string', required: false, createable: true, updateable: true },
    { name: 'Type', label: 'Type', type: 'string', required: false, createable: true, updateable: true },
    { name: 'Rating', label: 'Rating', type: 'string', required: false, createable: true, updateable: true },
    { name: 'NumberOfEmployees', label: 'Number of Employees', type: 'int', required: false, createable: true, updateable: true },
    { name: 'BillingCountry', label: 'Billing Country', type: 'string', required: false, createable: true, updateable: true },
    { name: 'BillingCity', label: 'Billing City', type: 'string', required: false, createable: true, updateable: true },
    { name: 'BillingState', label: 'Billing State', type: 'string', required: false, createable: true, updateable: true },
    { name: 'Description', label: 'Description', type: 'textarea', required: false, createable: true, updateable: true },
  ],
  Opportunity: [
    { name: 'Name', label: 'Name', type: 'string', required: true, createable: true, updateable: true },
    { name: 'StageName', label: 'Stage Name', type: 'picklist', required: true, createable: true, updateable: true, picklistValues: [] },
    { name: 'CloseDate', label: 'Close Date', type: 'date', required: true, createable: true, updateable: true },
    { name: 'Amount', label: 'Amount', type: 'currency', required: false, createable: true, updateable: true },
    { name: 'Type', label: 'Type', type: 'string', required: false, createable: true, updateable: true },
    { name: 'LeadSource', label: 'Lead Source', type: 'string', required: false, createable: true, updateable: true },
    { name: 'Probability', label: 'Probability', type: 'double', required: false, createable: true, updateable: true },
    { name: 'NextStep', label: 'Next Step', type: 'string', required: false, createable: true, updateable: true },
    { name: 'Description', label: 'Description', type: 'textarea', required: false, createable: true, updateable: true },
  ],
  Lead: [
    { name: 'FirstName', label: 'First Name', type: 'string', required: false, createable: true, updateable: true },
    { name: 'LastName', label: 'Last Name', type: 'string', required: true, createable: true, updateable: true },
    { name: 'Company', label: 'Company', type: 'string', required: true, createable: true, updateable: true },
    { name: 'Email', label: 'Email', type: 'email', required: false, createable: true, updateable: true },
    { name: 'Phone', label: 'Phone', type: 'phone', required: false, createable: true, updateable: true },
    { name: 'Title', label: 'Title', type: 'string', required: false, createable: true, updateable: true },
    { name: 'Status', label: 'Status', type: 'picklist', required: true, createable: true, updateable: true, picklistValues: [] },
    { name: 'LeadSource', label: 'Lead Source', type: 'string', required: false, createable: true, updateable: true },
    { name: 'Industry', label: 'Industry', type: 'string', required: false, createable: true, updateable: true },
    { name: 'Rating', label: 'Rating', type: 'string', required: false, createable: true, updateable: true },
  ],
  Contact: [
    { name: 'FirstName', label: 'First Name', type: 'string', required: false, createable: true, updateable: true },
    { name: 'LastName', label: 'Last Name', type: 'string', required: true, createable: true, updateable: true },
    { name: 'Email', label: 'Email', type: 'email', required: false, createable: true, updateable: true },
    { name: 'Phone', label: 'Phone', type: 'phone', required: false, createable: true, updateable: true },
    { name: 'Title', label: 'Title', type: 'string', required: false, createable: true, updateable: true },
    { name: 'Department', label: 'Department', type: 'string', required: false, createable: true, updateable: true },
    { name: 'MailingCity', label: 'Mailing City', type: 'string', required: false, createable: true, updateable: true },
    { name: 'MailingCountry', label: 'Mailing Country', type: 'string', required: false, createable: true, updateable: true },
    { name: 'MailingState', label: 'Mailing State', type: 'string', required: false, createable: true, updateable: true },
    { name: 'LeadSource', label: 'Lead Source', type: 'string', required: false, createable: true, updateable: true },
  ],
  Case: [
    { name: 'Subject', label: 'Subject', type: 'string', required: true, createable: true, updateable: true },
    { name: 'Status', label: 'Status', type: 'picklist', required: true, createable: true, updateable: true, picklistValues: [] },
    { name: 'Priority', label: 'Priority', type: 'picklist', required: true, createable: true, updateable: true, picklistValues: [] },
    { name: 'Origin', label: 'Origin', type: 'picklist', required: true, createable: true, updateable: true, picklistValues: [] },
    { name: 'Type', label: 'Type', type: 'string', required: false, createable: true, updateable: true },
    { name: 'Reason', label: 'Reason', type: 'string', required: false, createable: true, updateable: true },
    { name: 'Description', label: 'Description', type: 'textarea', required: false, createable: true, updateable: true },
    { name: 'ContactId', label: 'Contact Id', type: 'reference', required: false, createable: true, updateable: true },
    { name: 'AccountId', label: 'Account Id', type: 'reference', required: false, createable: true, updateable: true },
    { name: 'SuppliedEmail', label: 'Supplied Email', type: 'email', required: false, createable: true, updateable: true },
  ],
};

const api = async (path, options = {}) => {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
  return res.status === 204 ? null : res.json();
};

const empty = (fields) => Object.fromEntries(fields.filter(field => field.createable).map(field => [field.name, '']));
const cleanPayload = (fields, value, isUpdate) => Object.fromEntries(
  fields
    .filter(field => isUpdate ? field.updateable : field.createable)
    .map(field => [field.name, value[field.name]])
    .filter(([, fieldValue]) => fieldValue !== '' && fieldValue !== null && fieldValue !== undefined)
);

function RecordForm({ fields, initial, onCancel, onSave, saving }) {
  const [value, setValue] = useState(initial);
  const [validationError, setValidationError] = useState('');
  const editable = fields.filter(field => initial.Id ? field.updateable : field.createable).slice(0, 10);

  return <form className="form" onSubmit={event => { event.preventDefault(); const invalidPhone = editable.find(field => field.type === 'phone' && value[field.name] && !/^\d{10}$/.test(value[field.name])); if (invalidPhone) { setValidationError(`${invalidPhone.label} must contain exactly 10 digits.`); return; } setValidationError(''); onSave(cleanPayload(editable, value, Boolean(initial.Id))); }}>
    {validationError && <div className="error form-error">{validationError}</div>}
    {editable.map(field => <label key={field.name}>{field.label}{field.required && ' *'}
      {field.picklistValues?.length
        ? <select required={field.required} value={value[field.name] || ''} onChange={event => setValue({ ...value, [field.name]: event.target.value })}>
          <option value="">Select...</option>{field.picklistValues.map(option => <option key={option}>{option}</option>)}
        </select>
        : field.type === 'textarea'
          ? <textarea required={field.required} value={value[field.name] ?? ''} onChange={event => setValue({ ...value, [field.name]: event.target.value })} />
          : <input required={field.required} type={field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'currency' || field.type === 'double' || field.type === 'int' ? 'number' : 'text'} inputMode={field.type === 'phone' ? 'numeric' : undefined} maxLength={field.type === 'phone' ? 10 : undefined} value={value[field.name] ?? ''} onChange={event => { setValue({ ...value, [field.name]: event.target.value }); if (field.type === 'phone') setValidationError(''); }} />}
    </label>)}
    <div className="actions"><button type="button" className="secondary" onClick={onCancel} disabled={saving}>Cancel</button><button disabled={saving}>{saving ? 'Saving...' : 'Save record'}</button></div>
  </form>;
}

function RecordView({ fields, record, onClose }) {
  return <>
    <div className="record-view">
      {fields.slice(0, 10).map(field => <div key={field.name}>
        <span>{field.label}</span>
        <strong>{record[field.name] ?? '-'}</strong>
      </div>)}
    </div>
    <div className="actions"><button className="secondary" onClick={onClose}>Close</button></div>
  </>;
}

function App() {
  const [session, setSession] = useState(null);
  const [object, setObject] = useState('Account');
  const [meta, setMeta] = useState(null);
  const [records, setRecords] = useState([]);
  const [columns, setColumns] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (reset = false) => {
    if (loading || (!reset && !hasMore)) return;
    setLoading(true);
    try {
      const offset = reset ? 0 : records.length;
      const data = await api(`/api/objects/${object}/records?offset=${offset}&limit=${recordsPerPage}`);
      setRecords(reset ? data.records : current => [...current, ...data.records]);
      setColumns(data.fields);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [object, records.length, hasMore, loading]);

  useEffect(() => {
    api('/api/session').then(setSession).catch(() => setSession({ authenticated: false }));
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;
    setMeta(null);
    setRecords([]);
    setHasMore(true);
    api(`/api/objects/${object}/describe`)
      .then(setMeta)
      .catch(err => {
        setMeta({ fields: fallbackFields[object] });
        setError(err.message);
      });
  }, [object, session]);

  useEffect(() => {
    if (session?.authenticated && hasMore && !loading && !records.length) load(true);
  }, [session, object, hasMore, loading, records.length, load]);

  const save = async value => {
    setSaving(true);
    setFormError('');
    try {
      if (modal.record?.Id) {
        await api(`/api/objects/${object}/records/${modal.record.Id}`, { method: 'PATCH', body: JSON.stringify(value) });
      } else {
        await api(`/api/objects/${object}/records`, { method: 'POST', body: JSON.stringify(value) });
      }
      setModal(null);
      setError('');
      if (!columns.length) setColumns(visibleFields.map(field => field.name));
      setHasMore(true);
      await load(true);
    } catch (err) {
      setFormError(err.message);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async record => {
    if (!confirm(`Delete this ${object} record?`)) return;
    try {
      await api(`/api/objects/${object}/records/${record.Id}`, { method: 'DELETE' });
      setRecords(current => current.filter(row => row.Id !== record.Id));
    } catch (err) {
      setError(err.message);
    }
  };

  if (!session) return <main className="center">Loading...</main>;
  if (!session.authenticated) {
    return <main className="landing"><span className="eyebrow">SALESFORCE CONNECTED APP</span><h1>Manage Salesforce data simply.</h1><p>Securely sign in to view and manage Account, Opportunity, Lead, Contact, and Case records.</p><a className="login" href="/auth/login">Log in to Salesforce -&gt;</a></main>;
  }

  const visibleFields = meta?.fields || fallbackFields[object];
  const fieldLabels = Object.fromEntries(visibleFields.map(field => [field.name, field.label]));

  return <main>
    <header><div><span className="eyebrow">SALESFORCE CRUD CONSOLE</span><h1>{object} records</h1><p className="subtitle">Create, review, and keep your Salesforce data up to date.</p></div><div className="user"><span>{session.user}</span><button className="link" onClick={async () => { await api('/api/logout', { method: 'POST' }); setSession({ authenticated: false }); }}>Log out</button></div></header>
    <section className="toolbar"><div className="object-picker"><label>Salesforce object<select value={object} onChange={event => setObject(event.target.value)}>{objects.map(name => <option key={name}>{name}</option>)}</select></label><span className="record-count">{records.length} record{records.length === 1 ? '' : 's'} loaded</span></div><div className="toolbar-actions"><button className="secondary" onClick={() => load(true)} disabled={loading}>↻ Refresh</button><button onClick={() => setModal({ mode: 'edit', record: empty(visibleFields) })}>+ New {object}</button></div></section>
    {error && <div className="error" onClick={() => setError('')}>{error} x</div>}
    <section className="table-wrap"><table><thead><tr>{columns.map(column => <th key={column}>{fieldLabels[column] || column}</th>)}<th className="actions-heading">Actions</th></tr></thead><tbody>{records.map(record => <tr key={record.Id}>{columns.map(column => <td key={column}>{record[column] ?? '-'}</td>)}<td className="row-actions"><button className="link" onClick={() => setModal({ mode: 'view', record })}>View</button><button className="link" onClick={() => setModal({ mode: 'edit', record })}>Edit</button><button className="danger" onClick={() => remove(record)}>Delete</button></td></tr>)}</tbody></table>{!records.length && !loading && <p className="empty">No {object} records found. Create your first one to see it here.</p>}<div className="loading">{loading ? `Loading next records...` : hasMore ? <button className="secondary next-page" onClick={() => load()}>Load Next Records</button> : records.length ? 'All loaded records are shown' : ''}</div></section>
    {modal && <div className="backdrop"><section className="modal"><h2>{modal.mode === 'view' ? `View ${object}` : modal.record.Id ? `Update ${object}` : `New ${object}`}</h2>{formError && <div className="error">{formError} x</div>}{modal.mode === 'view' ? <RecordView fields={visibleFields} record={modal.record} onClose={() => setModal(null)} /> : <RecordForm fields={visibleFields} initial={modal.record} onCancel={() => setModal(null)} onSave={save} saving={saving} />}</section></div>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
