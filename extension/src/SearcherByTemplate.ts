import {ScAddr, ScClient, ScConstruction, ScType} from 'ts-sc-client';
import {createTechnicalWinkId} from "./Utils";

export class SearcherByTemplate {
    scClient: ScClient;

    constructor(client: ScClient) { this.scClient = client; }

    async findByScsTemplate(scsTemplate: string): Promise<string> 
    {
        const structWinkIdtf = createTechnicalWinkId();

        console.log("findByScsTemplate, scsTemplate:", scsTemplate);
        console.log("findByScsTemplate, structWinkIdtf:", structWinkIdtf);

        //returns array with scAddrs which are correspond to template
        const searchingResults = await this.scClient.searchByTemplate(scsTemplate);
        console.log("findByScsTemplate, searchingResults:", searchingResults);

        // from found scAddrs we collect theirs int values
        const uniqNodes = new Set<number>();
        searchingResults.forEach(e => e.forEachTriple(n => uniqNodes.add(n.value)));

        // sctructure which contains found construstions
        const structNode = (await this.scClient.resolveKeynodes([{id: structWinkIdtf, type: ScType.ConstNodeStructure}]))[0];
        const construction = new ScConstruction();

        // connect found constructions to structure
        uniqNodes.forEach(node => {
            construction.generateConnector(
                ScType.ConstPermPosArc,
                structNode,
                new ScAddr(node)
            );
            console.log("findByScsTemplate, found and generated nodes:", node);
        });

        if(uniqNodes.size == 0)
        {
            console.log("findByScsTemplate, found no structures");
        }


        await this.scClient.generateElements(construction);
        return structWinkIdtf;
    }
}
