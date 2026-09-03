import AccountRegisterForm from '@/components/AccountRegisterForm';
import { recordPageVisit } from '@/lib/pageVisits';

export default async function RegisterPage() {
  await recordPageVisit({ page: 'account_register', path: '/auth/register' });

  return <AccountRegisterForm />;
}
