import { getDashboardStats } from './app/actions/admin-actions';
(async () => {
    console.log(await getDashboardStats());
})();
