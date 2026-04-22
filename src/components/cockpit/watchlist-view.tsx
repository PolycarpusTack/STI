"use client";

import { IssueList } from "./issue-list";
import { IssueDetail } from "./issue-detail";

export function WatchlistView() {
  return (
    <div className="flex h-full divide-x">
      <div className="w-[350px] shrink-0 overflow-hidden">
        <IssueList />
      </div>
      <div className="flex-1 overflow-hidden">
        <IssueDetail />
      </div>
    </div>
  );
}
