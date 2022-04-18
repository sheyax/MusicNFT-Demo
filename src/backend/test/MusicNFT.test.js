const { expect } = require("chai");

const toWei = (num) => ethers.utils.parseEther(num.toString())
const fromWei = (num) => ethers.utils.formatEther(num)


describe("MusicNFT", function() {

    let nftMarketplace
    let deployer, artist, user1, user2, user3
    let royaltyFee = toWei(0.01);
    let URI = "https://bafybeic5vuzjkagzt3ybnsxe4tuiksbtv4fcz56lfj5imjr45x2paaf2ua.ipfs.nftstorage.link/"
    let prices = [toWei(1), toWei(2), toWei(3), toWei(4), toWei(5), toWei(6), toWei(7), toWei(8)]
    let deploymentFees = toWei(prices.length * 0.01);

    beforeEach(async function() {
        //Get contractFactory and Signers here
        const NFTMarketplaceFactory = await ethers.getContractFactory("MusicNFT");
        [deployer, artist, user1, user2, ...users] = await ethers.getSigners();

        //Deploy music nft to marketplace contract
        nftMarketplace = await NFTMarketplaceFactory.deploy(
            royaltyFee,
            artist.address,
            prices, { value: deploymentFees }
        );

    });

    describe("Deploynment", function() {
        it("Should track name, symbol, URI, royalty fee, and artist", async function() {
            const nftName = "SAXFi"
            const nftSymbol = "SAX"
            expect(await nftMarketplace.name()).to.equal(nftName);
            expect(await nftMarketplace.symbol()).to.equal(nftSymbol);
            expect(await nftMarketplace.baseURI()).to.equal(URI);
            expect(await nftMarketplace.royaltyFee()).to.equal(royaltyFee);
            expect(await nftMarketplace.artist()).to.equal(artist.address);
        });

        it("Should mint then list all the music nft", async function() {
            expect(await nftMarketplace.balanceOf(nftMarketplace.address)).to.equal(8);

            //Get each item from the marketItems array then check fields to ensure they are correct
            await Promise.all(prices.map(async(i, indx) => {
                const item = await nftMarketplace.marketItems(indx)
                expect(item.tokenId).to.equal(indx)
                expect(item.seller).to.equal(deployer.address)
                expect(item.price).to.equal(i)
            }))
        });

        it("Ether balance should equal deployment fees", async function() {
            expect(await ethers.provider.getBalance(nftMarketplace.address)).to.equal(deploymentFees)
        });

    });

    describe("Updating royalty fee", function() {
        it("Only deployer should be able to update royalty fee", async function() {
            const fee = toWei(0.02);
            await nftMarketplace.updateRoyaltyFee(fee)
            await expect(
                nftMarketplace.connect(user1).updateRoyaltyFee(fee)
            ).to.be.revertedWith("Ownable: caller is not the owner");

            expect(await nftMarketplace.royaltyFee()).to.equal(fee)
        });
    });

    describe("Buying Tokens", function() {
        it("Should update seller to zero address, transfer NFT, pay seller, pay royalty and emit a MarketItemBought event", async function() {
            const deployerInitialEthBal = await deployer.getBalance();
            const artistInitialEthBal = await artist.getBalance()

            await expect(
                    nftMarketplace.connect(user1).buyToken(0, { value: prices[0] }))
                .to.emit(nftMarketplace, "MarketItemBought")
                .withArgs(
                    0,
                    deployer.address,
                    user1.address,
                    prices[0]
                )
            const deployerFinalEthBal = await deployer.getBalance()
            const artistFinalEthBal = await artist.getBalance()
                //Item seller shouldb e zero address
            expect((await nftMarketplace.marketItems(0)).seller).to.equal("0x0000000000000000000000000000000000000000")
                //Seller should receive payment for the price of nft sold 
            expect(+fromWei(deployerFinalEthBal)).to.equal(+fromWei(prices[0]) + +fromWei(deployerInitialEthBal))
                //Artist should receive royalty 
            expect(+fromWei(artistFinalEthBal)).to.equal(+fromWei(royaltyFee) + +fromWei(artistInitialEthBal))
                //buyer should now own the nft 
            expect(await nftMarketplace.ownerOf(0)).to.equal(user1.address)

        })

        it("Should fail when ether amount sent with transaction does not equal asking price", async function() {
            await expect(
                nftMarketplace.connect(user1).buyToken(0, { value: prices[1] })
            ).to.be.revertedWith("Please send the asking price in order to complete the purchase")
        });
    })

    describe("Reselling tokens", function() {
        beforeEach(async function() {
            // user1 purchases an item.
            await nftMarketplace.connect(user1).buyToken(0, { value: prices[0] })
        })

        it("Should track resale item, incr. ether bal by royalty fee, transfer NFT to marketplace and emit MarketItemRelisted event", async function() {
            const resaleprice = toWei(2)
            const initMarketBal = await ethers.provider.getBalance(nftMarketplace.address)
                // user1 lists the nft for a price of 2 hoping to flip it and double their money
            await expect(nftMarketplace.connect(user1).resellToken(0, resaleprice, { value: royaltyFee }))
                .to.emit(nftMarketplace, "MarketItemRelisted")
                .withArgs(
                    0,
                    user1.address,
                    resaleprice
                )
            const finalMarketBal = await ethers.provider.getBalance(nftMarketplace.address)
                // Expect final market bal to equal inital + royalty fee
            expect(+fromWei(finalMarketBal)).to.equal(+fromWei(royaltyFee) + +fromWei(initMarketBal))
                // Owner of NFT should now be the marketplace
            expect(await nftMarketplace.ownerOf(0)).to.equal(nftMarketplace.address);
            // Get item from items mapping then check fields to ensure they are correct
            const item = await nftMarketplace.marketItems(0)
            expect(item.tokenId).to.equal(0)
            expect(item.seller).to.equal(user1.address)
            expect(item.price).to.equal(resaleprice)
        });

        it("Should fail if price is set to zero and royalty fee is not paid", async function() {
            await expect(
                nftMarketplace.connect(user1).resellToken(0, 0, { value: royaltyFee })
            ).to.be.revertedWith("Price must be greater than zero");
            await expect(
                nftMarketplace.connect(user1).resellToken(0, toWei(1), { value: 0 })
            ).to.be.revertedWith("Must pay royalty");
        });
    });

    describe("Getter functions", function() {
        let soldItems = [0, 1, 4]
        let ownedByUser1 = [0, 1]
        let ownedByUser2 = [4]

        beforeEach(async function() {
            //User1 purchases item 0
            await (await nftMarketplace.connect(user1).buyToken(0, { value: prices[0] })).wait();
            //user1 purchases item 1
            await (await nftMarketplace.connect(user1).buyToken(1, { value: prices[1] })).wait();
            //user2 purchases item 4 
            await (await nftMarketplace.connect(user2).buyToken(4, { value: prices[4] })).wait();
        })

        it("getAllUnsoldTokens should fetch all marketplace items for sale", async function() {
            const unsoldItems = await nftMarketplace.getAllUnsoldTokens();

            //check to make sure that all the retuened unsoldItems have sorted out sold items
            expect(unsoldItems.every(i => !soldItems.some(j => j === i.tokenId.toNumber()))).to.equal(true)
                //check that the length is correct
            expect(unsoldItems.length === prices.length - soldItems.length).to.equal(true)
        });

        it("getMyToken should fetch all tokens the user owns", async function() {
            //Get items owned by user1
            let myItems = await nftMarketplace.connect(user1).getMyTokens()
                //check that the returned items array is correct
            expect(myItems.every(i => ownedByUser1.some(j => j === i.tokenId.toNumber()))).to.equal(true)
            expect(ownedByUser1.length === myItems.length).to.equal(true)
                //get items owned by user2
            myItems = await nftMarketplace.connect(user2).getTokens()
                //Check that the returned items array areis correctly
            expect(myItems.every(i => ownedByUser2.some(j => j === i.tokenId.toNumber()))).to.equal(true)
            expect(ownedByUser2.length === myItems.length).to.equal(true)
        });


    });

})