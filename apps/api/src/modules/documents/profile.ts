import type { Env } from '../../config/env.js';
import { BusinessError } from '../enquiries/creation.js';
// DM details are from the quotation PDF supplied by the user.
export function quotationCompany(env: Env, company: 'DM' | 'MM') {
  const name =
    env[`${company}_COMPANY_NAME`] ||
    (company === 'DM' ? 'D.M. Metalloys Pvt. Ltd.' : '');
  const address =
    env[`${company}_COMPANY_ADDRESS`] ||
    (company === 'DM'
      ? 'H.O. : 27, Gurjar Building, Office No. 1, Sadashiv Cross Lane, Girgaum, Mumbai- 400004.'
      : '');
  if (!name || !address)
    throw new BusinessError(
      409,
      'COMPANY_CONFIGURATION_REQUIRED',
      'Configure the selected company name and address before generating its quotation.',
    );
  return { name, address, gstin: env[`${company}_COMPANY_GSTIN`] };
}
