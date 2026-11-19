import { validateEvenHubPageContainer } from '@evenrealities/even_hub_sdk';

const header = { containerID: 1, containerName: 'header', xPosition: 0, yPosition: 0, width: 576, height: 36, content: 'CryptoGlance 16:17 LIVE', isEventCapture: 0, zOrderIndex: 1 };
const footer = { containerID: 4, containerName: 'footer', xPosition: 0, yPosition: 250, width: 576, height: 34, content: 'Tap a coin', isEventCapture: 0, zOrderIndex: 4 };
const menuObject = { menuItems: [ { itemID: 1, itemName: 'Refresh prices' }, { itemID: 2, itemName: 'Paper portfolio' }, { itemID: 3, itemName: 'Price alerts' } ] };

const listPage = {
  containerTotalNum: 3,
  textObject: [header, footer],
  listObject: [{ containerID: 3, containerName: 'main-list', xPosition: 0, yPosition: 42, width: 576, height: 202, isEventCapture: 1, zOrderIndex: 3, itemContainer: { itemCount: 5, itemName: ['BTC $97,240 +2.4%','ETH $3,412 +1.8%','BNB $692.4 -0.6%','SOL $214.8 +4.1%','XRP $2.41 -1.2%'] } }],
  menuObject,
};

const stdPage = {
  containerTotalNum: 4,
  textObject: [header, { containerID: 2, containerName: 'body', xPosition: 8, yPosition: 42, width: 560, height: 138, content: 'line1\nline2', isEventCapture: 0, zOrderIndex: 2 }, footer],
  listObject: [{ containerID: 3, containerName: 'main-list', xPosition: 0, yPosition: 186, width: 576, height: 60, isEventCapture: 1, zOrderIndex: 3, itemContainer: { itemCount: 5, itemName: ['Paper buy $10','Paper sell $10','Alert at +5%','Alert at -5%','Back to list'] } }],
  menuObject,
};

console.log('list page:', JSON.stringify(validateEvenHubPageContainer(listPage)));
console.log('std page:', JSON.stringify(validateEvenHubPageContainer(stdPage)));
