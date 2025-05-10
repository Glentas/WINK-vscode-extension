import * as vscode from 'vscode';
import {ScAddr, ScClient, ScTemplate, ScType} from 'ts-sc-client';
import {createTechnicalWinkId} from "./Utils";
import {convertOldGwfToNew} from "./Old2NewScgConverter";
import {gwfToScsAsync} from "kb-generator-ts";

export type WinkID = string;

export enum LoadMode 
{
    Preview,
    Save
}

export class ScsLoader implements vscode.TreeDataProvider<LoadedScs> 
{
    loadedScs: Map<vscode.Uri, LoadedScs> = new Map();
    scClient: ScClient;

    constructor(client: ScClient) 
    {
        this.scClient = client;
    }

    async loadScs(filenames: vscode.Uri[], loadMode: LoadMode = LoadMode.Preview): Promise<string[]> 
    {
        const result: string[] = [];

        for (const filename of filenames) {
            const exists = this.loadedScs.has(filename);

            if (exists) await this.unloadScs([filename]);
            const doc = await vscode.workspace.openTextDocument(filename);
            let preparedScs: { id: string, text: string };

            if (filename.path.endsWith('.gwf')) 
            {
                const gwfInNewFormat: string = convertOldGwfToNew(doc.getText());
                const resultScs = await gwfToScsAsync(gwfInNewFormat);
                preparedScs = this.wrapScs(resultScs);
            } 
            else 
            {
                preparedScs = this.wrapScs(doc.getText());
            }

            if (!preparedScs) continue;
            
            console.log("loadScs, preparedScs:", preparedScs);
            const isCreated = await this.scClient.generateElementsBySCs([preparedScs.text]);

            if (isCreated) 
            {
                vscode.window.showInformationMessage("Loading completed successfully");
                this.loadedScs.set(filename, new LoadedScs(filename, {id: preparedScs.id, mode: loadMode, text: preparedScs.text}));
                result.push(preparedScs.id);
                console.log("loadScs, loadedSCS:", this.loadedScs);
            } 
            else 
            {
                vscode.window.showErrorMessage("Loading failed");
                result.push("");
            }
        }
        this.refresh();
        

        return result;
    }

    private wrapScs(text: string): { id: string; text: string } 
    {
        const technicalIdtf = createTechnicalWinkId();
        const resultSCs = technicalIdtf + " = [* " + text + " *];;";
        return {id: technicalIdtf, text: resultSCs};
    }

    async unloadScs(filenames: vscode.Uri[]): Promise<{ idtf: string, errorMsg: string }[]> 
    {
        const result = new Array<{ idtf: string, errorMsg: string }>();
        
        for (const filename of filenames) 
        {
            if (this.loadedScs.has(filename)) 
            {
                const contourNodeIdtf = this.loadedScs.get(filename).id;
                this.loadedScs.delete(filename);
                this.refresh();

                const contourAddr = (await this.scClient.resolveKeynodes([{
                    id: contourNodeIdtf,
                    type: ScType.Node
                }]))[contourNodeIdtf];

                console.log("unloadScs, contourAddr:", contourAddr.value);

                const foundAddrs = await this.findElementsInContour(contourAddr);
                const array_with_sc_addrs_to_delete: ScAddr[] = [];

                for(const addr of foundAddrs)
                {
                    array_with_sc_addrs_to_delete.push(new ScAddr(addr));
                }

                console.log("unloadScs, Enter function eraseElements. Deleting addrs:", array_with_sc_addrs_to_delete);
                await this.scClient.eraseElements(array_with_sc_addrs_to_delete);
                console.log("unloadScs, Erased succesfully");

                if (foundAddrs.size > 0) 
                {
                    result.push({idtf: contourNodeIdtf, errorMsg: ""});
                }
                else 
                {
                    result.push({
                    idtf: "",
                    errorMsg: "Can't find this construction in connected sc-machine. Maybe someone else deleted this construction from the base? "
                    });
                }
            } 
            else 
            {
                result.push({
                    idtf: "",
                    errorMsg: "There is no such construction. Maybe you haven't uploaded this construction or you've already deleted it?"
                });
            }
        }
        return result;
    }

    public async unloadAll(loadMode: LoadMode = LoadMode.Preview): Promise<Set<number>> 
    {
        const allIdtfs = this.loadedScs.values();
        const foundAddrs = new Set<number>();

        for (const scsIdtf of allIdtfs) 
        {
            if (scsIdtf.mode == loadMode) 
            {
                const contourAddr = (await this.scClient.resolveKeynodes([{
                    id: scsIdtf.id,
                    type: ScType.ConstNodeStructure
                }]))[scsIdtf.id];

                const temp = await this.findElementsInContour(contourAddr);
                
                console.log("Unload all: contourAddr:", contourAddr.value);

                temp.forEach(element => {
                    foundAddrs.add(element);
                });
            }
        }

        console.log("unloadAll, Enter function eraseElements. Deleting addrs:", foundAddrs);
        await this.scClient.eraseElements(Array.from(foundAddrs).map(e => new ScAddr(e)));
        console.log("unloadAll, Erased succesfully");

        this.loadedScs.clear();
        this.refresh();
        return foundAddrs;
    }

    private async findElementsInContour(contourNode: ScAddr) 
    {
        const unloadingTemplate1 = new ScTemplate().triple(
            contourNode,
            ScType.VarPermPosArc,
            ScType.VarNode
        );
        const unloadingTemplate2 = new ScTemplate().triple(
            contourNode,
            ScType.VarPermPosArc,
            ScType.VarCommonArc
        );
        const unloadingTemplate3 = new ScTemplate().triple(
            contourNode,
            ScType.VarPermPosArc,
            ScType.VarPermPosArc
        );
        const unloadingTemplate4 = new ScTemplate().triple(
            contourNode,
            ScType.VarCommonArc,
            ScType.VarNodeLink
        );
        
        const templates = [unloadingTemplate1, unloadingTemplate2, unloadingTemplate3, unloadingTemplate4];

        const foundAddrs = new Set<number>();
        const found = [];

        for (const template of templates) 
        {
            found.push(await this.scClient.searchByTemplate(template));
        }

        found.reduce((prev, current) => prev.concat(current)).forEach(triplet => triplet.forEachTriple((addr1, addr2, addr3) => {
                foundAddrs.add(addr1.value);
                foundAddrs.add(addr2.value);
                foundAddrs.add(addr3.value);
                console.log("Found elements in contour: ", addr1.value, addr2.value, addr3.value);
            }));

        console.log(foundAddrs);

        return foundAddrs;
    }

    private _onDidChangeTreeData: vscode.EventEmitter<LoadedScs | undefined | void> = new vscode.EventEmitter<LoadedScs | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<LoadedScs | undefined | void> = this._onDidChangeTreeData.event;

    refresh(): void 
    {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: LoadedScs): vscode.TreeItem 
    {
        return element;
    }

    getChildren(_element?: LoadedScs): Thenable<LoadedScs[]> 
    {
        let ret_value = new Array<LoadedScs>();
        for (const i of this.loadedScs.values()) 
        {
            ret_value.push(i);
        }
        return Promise.resolve(ret_value);
    }

}

export class LoadedScs extends vscode.TreeItem 
{
    id: WinkID;
    mode: LoadMode;
    text: string;
    filename: vscode.Uri;

    constructor(filename: vscode.Uri, info: {id: WinkID, mode: LoadMode, text: string}) 
    {
        super(filename, vscode.TreeItemCollapsibleState.None);
        this.id = info.id;
        this.mode = info.mode;
        this.filename = filename;
        this.text = info.text;
    }
}
