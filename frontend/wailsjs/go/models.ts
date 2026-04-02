export namespace config {
	
	export class Config {
	    port: number;
	    authToken: string;
	    retentionDays: number;
	    maxItems: number;
	    hotkey: string;
	    dataDir: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.port = source["port"];
	        this.authToken = source["authToken"];
	        this.retentionDays = source["retentionDays"];
	        this.maxItems = source["maxItems"];
	        this.hotkey = source["hotkey"];
	        this.dataDir = source["dataDir"];
	    }
	}

}

export namespace storage {
	
	export class ClipboardItem {
	    id: number;
	    type: string;
	    content: string;
	    filePath: string;
	    contentHash: string;
	    sourceApp: string;
	    isPinned: boolean;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new ClipboardItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.content = source["content"];
	        this.filePath = source["filePath"];
	        this.contentHash = source["contentHash"];
	        this.sourceApp = source["sourceApp"];
	        this.isPinned = source["isPinned"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SearchFilter {
	    query: string;
	    itemType: string;
	    timeRange: string;
	
	    static createFrom(source: any = {}) {
	        return new SearchFilter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.query = source["query"];
	        this.itemType = source["itemType"];
	        this.timeRange = source["timeRange"];
	    }
	}

}

