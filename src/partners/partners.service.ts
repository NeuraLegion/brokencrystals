import { Injectable, Logger } from '@nestjs/common';

const xpath = require('xpath');
const dom = require('xmldom').DOMParser;

export enum PartnerProperties {
  Name = 'name',
  Age = 'age',
  Profession = 'profession',
  Residency = 'residency',
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
      </partner>

      <partner>
        <name>Jesse Pinkman</name>
        <age>25</age>
        <profession>Professional Cook</profession>
        <residency country="US" state="New Mexico" city="Yo Mom" />
      </partner>

      <partner>
        <name>Michael Ehrmantraut</name>
        <age>65</age>
        <profession>Security Agent</profession>
        <residency country="US" state="New Mexico" city="Albuquerque" />
      </partner>

      <partner>
        <name>Maximus Prime</name>
        <age>21</age>
        <profession>Security Analyst</profession>
        <residency country="IL" city="Haifa" />
      </partner>
    </partners>
  `;

  private getPartnersXMLObj(): object {
    let partnersXMLObj = new dom().parseFromString(this.XML_AUTHORS_STR, 'text/xml');
    return partnersXMLObj;
  }

  selectPartnerPropertyByXPATH(xpathExpression: string): Array<string> {
    let partnersXMLObj = this.getPartnersXMLObj();
    return xpath.select(xpathExpression, partnersXMLObj);
  }

  static getAllSubPropertiesAsText(): string {
    let mappings = [];
    for (const [key, value] of Object.entries(PartnersService.propertiesSubCategoriesMapping)) {
      mappings.push(`For the property '${key}' you can use: ${value}`)
    }

    return mappings.join(' | ');
  }
}
