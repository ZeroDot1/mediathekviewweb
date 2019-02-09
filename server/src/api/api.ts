import { AggregatedEntry, EntrySearchResult } from '../common/model';
import { SearchEngine } from '../common/search-engine';
import { SearchQuery } from '../common/search-engine/query';

export class MediathekViewWebApi {
  private readonly searchEngine: SearchEngine<AggregatedEntry>;

  constructor(searchEngine: SearchEngine<AggregatedEntry>) {
    this.searchEngine = searchEngine;
  }

  async search(searchQuery: SearchQuery): Promise<EntrySearchResult> {
    const result = await this.searchEngine.search(searchQuery);
    return result;
  }
}
