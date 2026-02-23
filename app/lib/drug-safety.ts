export async function checkDrugInteractions(drugNames: string[]): Promise<{
    hasInteractions: boolean
    interactions: string[]
}> {
    if (drugNames.length < 2) return { hasInteractions: false, interactions: [] }

    try {
        const query = drugNames.slice(0, 4).join('+AND+')
        const res = await fetch(
            `https://api.fda.gov/drug/label.json?search=drug_interactions:${encodeURIComponent(query)}&limit=3`,
            { next: { revalidate: 3600 } }
        )

        if (!res.ok) return { hasInteractions: false, interactions: [] }

        const data = await res.json()

        if (data.results?.length > 0) {
            const interactions = data.results
                .map((r: any) => r.drug_interactions?.[0])
                .filter(Boolean)
                .map((text: string) => text.length > 300 ? text.slice(0, 300) + '...' : text)
                .slice(0, 3)
            return { hasInteractions: interactions.length > 0, interactions }
        }
        return { hasInteractions: false, interactions: [] }
    } catch {
        return { hasInteractions: false, interactions: [] }
    }
}
