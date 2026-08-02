import React, { useMemo, useState } from 'react';
import { CaretDown, CaretRight, MagnifyingGlass } from '@phosphor-icons/react';
import { Card } from '../components/ui';
import PageHeader from './PageHeader';
import { usePageTitle } from '../hooks/usePageTitle';
import { FAQ_SECTIONS } from '../data/faq';
import type { FAQSection } from '../data/faq';

/** Flatten an answer to plain text so search can look inside it. */
function answerText(answer: string | string[]): string {
    return Array.isArray(answer) ? answer.join(' ') : answer;
}

/**
 * Filter sections down to items matching the query, keeping only sections that
 * still have something in them.
 */
function search(sections: FAQSection[], query: string): FAQSection[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return sections;

    return sections
        .map((section) => ({
            ...section,
            items: section.items.filter(
                (item) =>
                    item.question.toLowerCase().includes(needle) ||
                    answerText(item.answer).toLowerCase().includes(needle) ||
                    section.title.toLowerCase().includes(needle)
            ),
        }))
        .filter((section) => section.items.length > 0);
}

const Answer: React.FC<{ answer: string | string[] }> = ({ answer }) => {
    if (!Array.isArray(answer)) {
        return <p className="text-[13px] text-sw-muted leading-relaxed">{answer}</p>;
    }
    return (
        <div className="flex flex-col gap-2">
            {answer.map((paragraph, index) =>
                // Blank strings in the content are deliberate spacing.
                paragraph === '' ? (
                    <span key={index} className="h-1" />
                ) : (
                    <p
                        key={index}
                        className="text-[13px] text-sw-muted leading-relaxed"
                    >
                        {paragraph}
                    </p>
                )
            )}
        </div>
    );
};

/**
 * Help and FAQ.
 *
 * Simplified from the original two-level accordion: sections open to reveal
 * their questions, and each question is a native <details> so it works without
 * any open/closed state of its own. Searching expands everything that matched,
 * because hiding results behind a second click defeats the search.
 */
const HelpPage: React.FC = () => {
    usePageTitle('Help & FAQ');
    const [query, setQuery] = useState('');
    const [openSections, setOpenSections] = useState<Set<string>>(
        () => new Set([FAQ_SECTIONS[0]?.id].filter(Boolean) as string[])
    );

    const sections = useMemo(() => search(FAQ_SECTIONS, query), [query]);
    const searching = query.trim().length > 0;

    const toggle = (id: string) =>
        setOpenSections((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    return (
        <>
            <PageHeader
                title="Help & FAQ"
                caption="Everything you need to know about Splitwiser"
                mobileInset
            />

            <div className="flex-1 overflow-auto px-4 lg:px-[22px] py-4 max-w-3xl w-full">
                <div className="relative flex items-center mb-4">
                    <MagnifyingGlass
                        size={16}
                        className="absolute left-3 text-sw-dim pointer-events-none"
                    />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search help topics"
                        aria-label="Search help topics"
                        className="w-full pl-9 pr-3 py-2.5 rounded-sw-row bg-sw-sunk text-sw-text border border-sw-line placeholder:text-sw-dim focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
                    />
                </div>

                {sections.length === 0 ? (
                    <p className="text-[13px] text-sw-dim text-center py-12">
                        Nothing matches “{query}”.
                    </p>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        {sections.map((section) => {
                            // A search result is always open; otherwise honour the toggle.
                            const open = searching || openSections.has(section.id);
                            return (
                                <Card key={section.id} className="overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => toggle(section.id)}
                                        aria-expanded={open}
                                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-sw-raise focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
                                    >
                                        <span className="text-xl flex-none" aria-hidden="true">
                                            {section.icon}
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-[15px] font-medium">
                                                {section.title}
                                            </span>
                                            <span className="block text-[11.5px] text-sw-dim">
                                                {section.items.length}{' '}
                                                {section.items.length === 1
                                                    ? 'topic'
                                                    : 'topics'}
                                            </span>
                                        </span>
                                        <CaretDown
                                            size={16}
                                            className={`text-sw-dim flex-none transition-transform ${
                                                open ? 'rotate-180' : ''
                                            }`}
                                        />
                                    </button>

                                    {open && (
                                        <div className="border-t border-sw-line">
                                            {section.items.map((item, index) => (
                                                <details
                                                    key={index}
                                                    className="group border-b border-sw-line last:border-b-0"
                                                    open={searching}
                                                >
                                                    <summary className="flex items-start gap-2.5 px-4 py-3 cursor-pointer list-none hover:bg-sw-raise">
                                                        <CaretRight
                                                            size={15}
                                                            className="text-sw-accent mt-0.5 flex-none transition-transform group-open:rotate-90"
                                                        />
                                                        <span className="flex-1 text-[13.5px] font-medium">
                                                            {item.question}
                                                        </span>
                                                    </summary>
                                                    <div className="px-4 pb-4 pl-[42px]">
                                                        <Answer answer={item.answer} />
                                                    </div>
                                                </details>
                                            ))}
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                )}

                <p className="text-[12.5px] text-sw-dim text-center mt-8">
                    Still stuck? Read the{' '}
                    <a
                        href="https://github.com/vincewoo/splitwiser"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sw-accent hover:text-sw-text"
                    >
                        documentation
                    </a>{' '}
                    or{' '}
                    <a
                        href="https://github.com/vincewoo/splitwiser/issues"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sw-accent hover:text-sw-text"
                    >
                        report an issue
                    </a>
                    .
                </p>
            </div>
        </>
    );
};

export default HelpPage;
