-- Allow stories dropped due to minor summary validation issues (e.g. 61 words)
-- to be re-processed by the updated summarizer with auto-fitting.
delete from public.articles where reason = 'invalid-summary';
