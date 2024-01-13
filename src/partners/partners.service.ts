import { Injectable, Logger } from '@nestjs/common';

const xpath = require('xpath');
const dom = require('xmldom').DOMParser;

export enum PartnerProperties {
  Name = 'name',
  Age = 'age',
  Profession = 'profession',
  Residency = 'residency',
  Password = 'password'
}

@Injectable()
export class PartnersService {
  private static readonly propertiesSubCategoriesMapping = {
    "residency": ['country', 'state', 'city']
  }

  private readonly XML_AUTHORS_STR: string = `
  <?xml version="1.0" encoding="UTF-8"?>
    <partners>
      <partner>
        <name>Walter White</name>
        <age>50</age>
        <profession>Chemistry Teacher</profession>
        <residency country="US" state="New Mexico" city="Albuquerque" />
        <password>Heisenberg123</password>
      </partner>

      <partner>
        <name>Jesse Pinkman</name>
        <age>25</age>
        <profession>Professional Cook</profession>
        <residency country="US" state="New Mexico" city="Yo Moma" />
        <password>Yoyo1!</password>
      </partner>

      <partner>
        <name>Michael Ehrmantraut</name>
        <age>65</age>
        <profession>Personal Security Agent</profession>
        <residency country="US" state="New Mexico" city="Albuquerque" />
        <password>LittleKid777</password>
      </partner>
    </partners>
  `;

  static getAllSubPropertiesAsText(): string {
    let mappings = [];
    for (const [key, value] of Object.entries(PartnersService.propertiesSubCategoriesMapping)) {
      mappings.push(`For the property '${key}' you can use: ${value}`)
    }

    return mappings.join(' | ');
  }

  private getPartnersXMLObj(): object {
    let partnersXMLObj = new dom().parseFromString(this.XML_AUTHORS_STR, 'text/xml');
    return partnersXMLObj;
  }

  private selectPartnerPropertyByXPATH(xpathExpression: string): Array<string> {
    let partnersXMLObj = this.getPartnersXMLObj();
    return xpath.select(xpathExpression, partnersXMLObj);
  }

  getPartnersProperties(property: string, xpathExpression: string): any {
    let nodes = this.selectPartnerPropertyByXPATH(xpathExpression)

    if (property === "password") {
      return "No, this is a secret"
    }

    let finalXML = `<?xml version="1.0" encoding="UTF-8"?>
<${property + "-list"}>
${nodes.join('\n')}
</${property + "-list"}>`;

    return finalXML;
  }
}
