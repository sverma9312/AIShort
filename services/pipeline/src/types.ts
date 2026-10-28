/** An item as collected from a source, before normalization or extraction. */
export interface RawItem {
  sourceId: string;
  url: string;
  title: string;
  /** Plain-text excerpt from the feed (RSS description, paper abstract, …). */
  description?: string;
  /** ISO 8601 UTC timestamp, when the source provides one. */
  publishedAt?: string;
  imageUrl?: string;
  /** Community score: Hacker News points, Hugging Face upvotes. */
  points?: number;
  /** True when the title came from link text and the article's own title should replace it. */
  titleIsProvisional?: boolean;
}
