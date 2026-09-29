import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { COMPANY_LOGOS, COMPANY_NAME_LIMIT, validCompanyName, type CompanyIdentity, type CompanyLogo as Logo } from '../core/company-identity.js';
import { LogoUploadError, prepareCompanyLogo } from '../media/company-logo.js';
import { useI18n } from '../i18n/I18n.js';
import { CompanyLogo } from './CompanyLogo.js';
import { GameDialog } from './components/GameDialog.js';

export function CompanySetup({ onCreate, onClose }: { onCreate: (company: CompanyIdentity) => Promise<void>; onClose: () => void }) {
  const { t, text } = useI18n();
  const formId = useId();
  const [name, setName] = useState(t('company.defaultName'));
  const [logo, setLogo] = useState<Logo>({ kind: 'preset', id: 'wing' });
  const [processing, setProcessing] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [attempted, setAttempted] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null), fileInput = useRef<HTMLInputElement>(null);
  const uploadId = useRef(0);
  useEffect(() => { nameInput.current?.focus(); nameInput.current?.select(); return () => { uploadId.current++; }; }, []);
  const normalized = name.trim(), valid = validCompanyName(normalized), busy = processing || saving;
  async function upload(file?: File) {
    if (!file) return;
    const id = ++uploadId.current;
    setProcessing(true); setError('');
    try { const next = await prepareCompanyLogo(file); if (id === uploadId.current) setLogo(next); }
    catch (cause) { if (id === uploadId.current) setError(t(cause instanceof LogoUploadError ? `company.upload.${cause.reason}` : 'company.upload.decode')); }
    finally { if (id === uploadId.current) setProcessing(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setAttempted(true);
    if (!valid || busy) { if (!valid) nameInput.current?.focus(); return; }
    setSaving(true); setError('');
    try { await onCreate({ name: normalized, logo }); }
    catch (cause) { setError(text(cause instanceof Error ? cause.message : t('company.saveError'))); setSaving(false); }
  }
  return <GameDialog title={t('company.title')} closeLabel={t('company.cancel')} className="company-setup" onClose={() => { if (!saving) onClose(); }}
    footer={<div className="company-setup-actions"><p>{t('company.localHint')}</p><button form={formId} type="submit" className="primary" disabled={busy}>{saving ? t('company.saving') : t('company.create')}</button></div>}>
    <div className="company-setup-rotate"><h3>{t('rotate.title')}</h3><p>{t('rotate.subtitle')}</p></div>
    <form id={formId} onSubmit={event => void submit(event)} noValidate>
      <div className="company-setup-content">
        <aside className="company-preview" aria-label={t('company.preview')}>
          <span className="company-preview-kicker">{t('company.preview')}</span>
          <CompanyLogo logo={logo} label={t('company.logoAlt', { name: normalized || t('company.defaultName') })}/>
          <strong>{normalized || t('company.defaultName')}</strong>
          <span className="company-preview-rule"/>
          <small>{t('company.previewHelp')}</small>
        </aside>
        <div className="company-fields">
          <div className="company-name-field">
            <label htmlFor="company-name">{t('company.name')}</label>
            <input ref={nameInput} id="company-name" value={name} maxLength={COMPANY_NAME_LIMIT * 2} disabled={saving} autoComplete="organization" spellCheck={false}
              aria-invalid={attempted && !valid} aria-describedby="company-name-hint" onChange={event => setName(event.target.value)}/>
            <div id="company-name-hint" className={attempted && !valid ? 'company-field-error' : 'company-hint'}>
              <span>{attempted && !valid ? t('company.nameError') : t('company.nameHint')}</span><span>{[...normalized].length}/{COMPANY_NAME_LIMIT}</span>
            </div>
          </div>
          <fieldset disabled={busy} className="company-logo-options"><legend>{t('company.logo')}</legend>
            <div className="company-presets">{COMPANY_LOGOS.map(id => <button key={id} type="button" aria-label={t(`company.preset.${id}`)} aria-pressed={logo.kind === 'preset' && logo.id === id}
              onClick={() => { setLogo({ kind: 'preset', id }); setError(''); }}><CompanyLogo logo={{ kind: 'preset', id }}/><span>{t(`company.preset.${id}`)}</span></button>)}</div>
          </fieldset>
          <div className="company-upload"><button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>{processing ? t('company.processing') : t('company.upload')}</button><span>{t('company.uploadHint')}</span></div>
          <input ref={fileInput} className="file-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label={t('company.chooseImage')} disabled={busy}
            onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }}/>
          {error && <p className="company-field-error" role="alert">{error}</p>}
        </div>
      </div>
    </form>
  </GameDialog>;
}
