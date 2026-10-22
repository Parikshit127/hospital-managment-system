import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { hrApi } from '@/api/hr';
import { Button, Empty, ErrorBox, Field, ListRow, Loader, Pill, Screen, T } from '@/components/ui';
import { space } from '@/theme';

export default function Employees() {
    const router = useRouter();
    const [text, setText] = useState('');
    const [search, setSearch] = useState('');
    useEffect(() => { const id = setTimeout(() => setSearch(text.trim()), 350); return () => clearTimeout(id); }, [text]);

    const q = useInfiniteQuery({
        queryKey: ['hr', 'employees', search],
        initialPageParam: 1,
        queryFn: ({ pageParam }) => hrApi.employees({ search: search || undefined, page: pageParam, limit: 25 }),
        getNextPageParam: (last) => {
            const page = Number(last.meta?.page ?? 1), pages = Number(last.meta?.totalPages ?? 1);
            return page < pages ? page + 1 : undefined;
        },
    });
    const rows = q.data?.pages.flatMap(p => p.data) ?? [];
    const total = q.data?.pages[0]?.meta?.total;

    return (
        <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isFetchingNextPage && !q.isLoading} keyboard edges={[]}>
            <Field label="Search" value={text} onChangeText={setText} placeholder="Name, code, phone or email" autoCapitalize="none" />
            {typeof total === 'number' ? <T v="sub">{total} employee(s)</T> : null}
            {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : rows.length ? (
                <>
                    {rows.map(e => (
                        <ListRow
                            key={e.id} title={e.name} subtitle={`${e.employee_code} · ${e.designation}${e.user ? ` · @${e.user.username}` : ''}`}
                            right={!e.is_active ? <Pill label="Inactive" tone="danger" /> : undefined}
                            onPress={() => router.push({ pathname: '/hr/employee/[id]', params: { id: String(e.id) } })}
                        />
                    ))}
                    {q.hasNextPage ? <Button title="Load more" variant="secondary" loading={q.isFetchingNextPage} onPress={() => q.fetchNextPage()} style={{ marginTop: space.sm }} /> : null}
                </>
            ) : <Empty title="No employees found" />}
        </Screen>
    );
}
