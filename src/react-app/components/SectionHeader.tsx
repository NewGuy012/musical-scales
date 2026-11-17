import type { ReactNode } from "react";
import { IconChevronDown } from "./Icons";

interface SectionHeaderProps {
	headingId: string;
	title: string;
	description?: string;
	bodyId?: string;
	compact?: boolean;
	className?: string;
	titlePrefix?: ReactNode;
	titleBadge?: ReactNode;
	actions?: ReactNode;
	isCollapsed?: boolean;
	onToggleCollapse?: () => void;
}

/** Shared section header with optional right-side actions and collapse toggle. */
export function SectionHeader({
	headingId,
	title,
	description,
	bodyId,
	compact = false,
	className = "",
	titlePrefix,
	titleBadge,
	actions,
	isCollapsed = false,
	onToggleCollapse,
}: SectionHeaderProps) {
	const collapseActionLabel = `${isCollapsed ? "Expand" : "Collapse"} ${title}`;

	return (
		<div
			className={`section-header${compact ? " section-header-compact" : ""}${
				className ? ` ${className}` : ""
			}`}
		>
			<div
				className={`section-heading${onToggleCollapse ? " is-collapsible" : ""}`}
				onClick={onToggleCollapse}
			>
				{titlePrefix || titleBadge ? (
					<div className="section-title-row">
						{titlePrefix}
						<h2 id={headingId} className="section-title">
							{title}
						</h2>
						{titleBadge}
					</div>
				) : (
					<h2 id={headingId} className="section-title">
						{title}
					</h2>
				)}
				{description && <p className="section-desc">{description}</p>}
			</div>

			{(actions || onToggleCollapse) && (
				<div className="section-header-actions">
					{actions}
					{onToggleCollapse && (
						<button
							type="button"
							className={`section-collapse-btn${
								isCollapsed ? " is-collapsed" : ""
							}`}
							aria-expanded={!isCollapsed}
							aria-controls={bodyId}
							aria-label={collapseActionLabel}
							title={collapseActionLabel}
							onClick={onToggleCollapse}
						>
							<IconChevronDown size={14} />
						</button>
					)}
				</div>
			)}
		</div>
	);
}
