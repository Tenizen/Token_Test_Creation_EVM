const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
    return ethers.utils.parseUnits(n.toString(), 'ether')
}

describe('Exchange', () => {
    let deployer, feeAccount, exchange
    const feePercent = 10

    beforeEach(async() => {      
        const Exchange = await ethers.getContractFactory('Exchange')
        const Token = await ethers.getContractFactory('Token')

        token1 = await Token.deploy('Aethereum Coin', 'AETH', '1000000')
        token2 = await Token.deploy('Mock Dai', 'mDai', '1000000')

        accounts = await ethers.getSigners()
        deployer = accounts[0]
        feeAccount = accounts[1]
        user1 = accounts[2]
        user2 = accounts[3]

        let transaction = await token1.connect(deployer).transfer(user1.address, tokens(100))
        await transaction.wait()

        exchange = await Exchange.deploy(feeAccount.address, feePercent)
    })

    describe('Deployment', () => {
        it('tracks the fee account', async () => {
            expect(await exchange.feeAccount()).to.equal(feeAccount.address)
        }) 
        it('tracks the fee percent', async () => {
            expect(await exchange.feePercent()).to.equal(feePercent)
        }) 
    })

    describe('Depositing tokens', () => {
        let transaction, result
        let amount = tokens(10)

        describe('Success', () => {
            beforeEach(async() => {      
                // Approve Tokens
                transaction = await token1.connect(user1).approve(exchange.address, amount)
                result = await transaction.wait()
                // Deposit Tokens
                transaction = await exchange.connect(user1).depositToken(token1.address, amount)
                result = await transaction.wait()
            })

            it('tracks the token deposit', async () => {
                expect(await token1.balanceOf(exchange.address)).to.equal(amount)
                expect(await exchange.tokens(token1.address, user1.address)).to.equal(amount)
                expect(await exchange.balanceOf(token1.address, user1.address)).to.equal(amount)
            })

            it('emits a Deposit Event', async () => {
                const event = result.events[1] // 2 events are emitted
                expect(event.event).to.equal('Deposit')
    
                const args = event.args
                expect(args.token).to.equal(token1.address)
                expect(args.user).to.equal(user1.address)
                expect(args.amount).to.equal(amount)
                expect(args.balance).to.equal(amount)
            })
        })

        describe('Failure', () => {
            it('fails when no tokens are approved', async () => {
                // Don't approve any tokens before depositing
                await expect(exchange.connect(user1).depositToken(token1.address, amount)).to.be.reverted
            })
        })
    })

    describe('Withdrawing tokens', () => {
        let transaction, result
        let amount = tokens(10)

        describe('Success', () => {
            beforeEach(async() => {
                // Deposit tokens before withdrawing      
                // Approve Tokens
                transaction = await token1.connect(user1).approve(exchange.address, amount)
                result = await transaction.wait()
                // Deposit Tokens
                transaction = await exchange.connect(user1).depositToken(token1.address, amount)
                result = await transaction.wait()

                // Withdraw tokens
                transaction = await exchange.connect(user1).withdrawToken(token1.address, amount)
                result = await transaction.wait()
            })

            it('withdraws token funds', async () => {
                expect(await token1.balanceOf(exchange.address)).to.equal(0)
                expect(await exchange.tokens(token1.address, user1.address)).to.equal(0)
                expect(await exchange.balanceOf(token1.address, user1.address)).to.equal(0)
            })

            it('emits a Withdraw Event', async () => {
                const event = result.events[1] // 2 events are emitted
                expect(event.event).to.equal('Withdraw')
   
                const args = event.args
                expect(args.token).to.equal(token1.address)
                expect(args.user).to.equal(user1.address)
                expect(args.amount).to.equal(amount)
                expect(args.balance).to.equal(0)
           })
        })

        describe('Failure', () => {
            it('fails for insufficient balance', async () => {
                // Attempt to withdraw tokens without depositing
                await expect(exchange.connect(user1).withdrawToken(token1.address, amount)).to.be.reverted
            })
        })
    })

    describe('Checking Balances', () => {
        let transaction, result
        let amount = tokens(1)

            beforeEach(async() => {      
            // Approve Tokens
                transaction = await token1.connect(user1).approve(exchange.address, amount)
                result = await transaction.wait()
            // Deposit Tokens
                transaction = await exchange.connect(user1).depositToken(token1.address, amount)
                result = await transaction.wait()
        })

            it('returns user balance', async () => {
                expect(await exchange.balanceOf(token1.address, user1.address)).to.equal(amount)
            })
    })

    describe('Making orders', async () => {

        let transaction, result

        let amount = tokens(1)

        describe ('Success', async () => {
            beforeEach(async () => {
                // Deposit tokens before making order      
                // Approve Tokens
                transaction = await token1.connect(user1).approve(exchange.address, amount)
                result = await transaction.wait()
                // Deposit Tokens
                transaction = await exchange.connect(user1).depositToken(token1.address, amount)
                result = await transaction.wait()

                // Make order
                transaction = await exchange.connect(user1).makeOrder(token2.address, amount, token1.address, amount)
                result = await transaction.wait()
            })

            it('Tracks the newly created order', async () => {
                expect(await exchange.orderCount()).to.equal(1)
            })

            it('emits an Order event', async () => {
                const event = result.events[0]
                expect(event.event).to.equal('Order')
   
                const args = event.args
                expect(args.id).to.equal(1)
                expect(args.user).to.equal(user1.address)
                expect(args.tokenGet).to.equal(token2.address)
                expect(args.amountGet).to.equal(tokens(1))
                expect(args.tokenGive).to.equal(token1.address)
                expect(args.amountGive).to.equal(tokens(1))
                expect(args.timestamp).to.at.least(1)
            })

        })

        describe('Failure', async () => {
            it('Rejects with no balance', async () => {
                await expect(exchange.connect(user1).makeOrder(token2.address, tokens(1), token1.address, tokens(1))).to.be.reverted
            })
        })
    })

    describe('Order actions', async () => {
        let transaction, result
        let amount = tokens(1)

        beforeEach(async () => {
            // user1 deposits tokens
            transaction = await token1.connect(user1).approve(exchange.address, amount)
            result = await transaction.wait()

            transaction = await exchange.connect(user1).depositToken(token1.address, amount)
            result = await transaction.wait()

            // make an order
            transaction = await exchange.connect(user1).makeOrder(token2.address, amount, token1.address, amount)
            result = await transaction.wait()
        })

        describe('Cancelling orders', async () => {
            describe('Success', async () => {
                beforeEach(async () => {
                    transaction = await exchange.connect(user1).cancelOrder(1)
                    result = await transaction.wait()
                })

                it('updates canceled orders', async () => {
                    expect(await exchange.orderCancelled(1)).to.equal(true)
                })

                it('emits an Cancel event', async () => {
                    const event = result.events[0]
                    expect(event.event).to.equal('Cancel')
       
                    const args = event.args
                    expect(args.id).to.equal(1)
                    expect(args.user).to.equal(user1.address)
                    expect(args.tokenGet).to.equal(token2.address)
                    expect(args.amountGet).to.equal(tokens(1))
                    expect(args.tokenGive).to.equal(token1.address)
                    expect(args.amountGive).to.equal(tokens(1))
                    expect(args.timestamp).to.at.least(1)
                })
            })

            describe('Failure', async () => {
                beforeEach(async () => {
                    // user1 deposits tokens
                    transaction = await token1.connect(user1).approve(exchange.address, amount)
                    result = await transaction.wait()
                    transaction = await exchange.connect(user1).depositToken(token1.address, amount)
                    result = await transaction.wait()
                    // make an order
                    transaction = await exchange.connect(user1).makeOrder(token2.address, amount, token1.address, amount)
                    result = await transaction.wait()
                })
                it('rejects invalid order ids', async () => {
                    const invalidOrderId = 99999
                    await expect(exchange.connect(user1).cancelOrder(invalidOrderId)).to.be.reverted
                })

                it('rejects unauthorized cancelations', async () => {
                    await expect(exchange.connect(user2).cancelOrder(1)).to.be.reverted
                })
            })
        })
    })
})
