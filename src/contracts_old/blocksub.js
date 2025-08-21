const { SocketBlockSubscriber, WebSocketProvider,formatEther } = require('ethers');

const provider = new WebSocketProvider('wss://ws.coredao.org/');
const blockSub = new SocketBlockSubscriber(provider);

console.log(formatEther(38142420000000000n))
// (async () =>
// console.log(await provider.getFeeData()))()
// let gasUsed= 0;
// blockSub._handleMessage = async ({number}) => {
//     (await provider.getBlock(number, true)).transactions.map(
//         async (tx) => {
//             tx = await provider.getTransactionReceipt(tx)
//             if (tx.gasUsed > gasUsed) {
//                 const {gasPrice} = await provider.getFeeData()
//                 console.log(tx.gasUsed * gasPrice);
//                 gasUsed =tx.gasUsed ; 

//             }
//         }
//     )
//     // console.log(provider._wrapBlock({...result, transactions: []}));
//  };
// blockSub.start();