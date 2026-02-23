export async function searchICD10(query: string): Promise<{ code: string; name: string }[]> {
    if (!query || query.length < 2) return []

    try {
        const res = await fetch(
            `https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?sf=code,name&terms=${encodeURIComponent(query)}&maxList=10`,
            { next: { revalidate: 86400 } }
        )

        if (!res.ok) return []

        const data = await res.json()
        const results = data[3]
        return results?.map(([code, name]: string[]) => ({ code, name })) ?? []
    } catch {
        return []
    }
}
