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

        //for testing purposes
        // const my_template = new ScTemplate();
        // const u = this.scClient.searchKeynodes("set");

        
        // const search_addr = new ScAddr((await u).set.value);
        // console.log("findByScsTemplate, u:", search_addr.value);
        // const params = {["set"]: search_addr,};

        //my_template.triple(search_addr, ScType.VarPermPosArc, [ScType.VarNode, "_a"]);
        
        const searchingResults = await this.scClient.searchByTemplate(scsTemplate);
        console.log("findByScsTemplate, searchingResults:", searchingResults);

        const uniqNodes = new Set<number>();
        for(const i of searchingResults.values())
        {
            for(let j = 0; j < i.size; j++)
            {
                uniqNodes.add(i.get(j).value);
            }
        }

        console.log("findByScsTemplate, found nodes:", uniqNodes);

        const keynodes = [
            { id: structWinkIdtf, type: ScType.NodeStructure },
          ];
      
        const result_of_resolve = await this.scClient.resolveKeynodes(keynodes);
        const structNode = result_of_resolve[structWinkIdtf];
        console.log("findByScsTemplate, generated structNode:", structNode);

        const construction = new ScConstruction();
        
        for(const i of uniqNodes)
        {   
            const temp_addr = new ScAddr(i);
            
            construction.generateConnector(
                ScType.ConstPermPosArc,
                structNode,
                temp_addr
            );

            console.log("findByScsTemplate, generated connector:", i);
        }

        if(uniqNodes.size == 0)
        {
            console.log("findByScsTemplate, found no structures");
        }
        else
        {
            console.log("findByScsTemplate, generating construction...", construction);

            await this.scClient.generateElements(construction);

            console.log("findByScsTemplate, generation is succesfull");
        }

        return structWinkIdtf;
    }
}
